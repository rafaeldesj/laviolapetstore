// Impressão térmica (ESC/POS) do PDV: Bluetooth, USB-Serial (COM), USB direto (WebUSB) ou spooler do navegador.

import { formatQty, isFractional, unitShort } from './units';

export interface PrinterSettings {
  method: 'browser' | 'bluetooth' | 'serial' | 'usb';
  paperSize: '58mm' | '80mm';
  copies: number;
  baudRate?: number;
  autoPrintOnSale: boolean;
  openDrawer: boolean;
}

export interface ReceiptCompany {
  name: string;
  cnpj?: string;
  ie?: string;
  address?: string;
  phone?: string;
}

export interface ReceiptItem {
  name: string;
  sku?: string;
  /** Unidade de venda (UN, KG, LT); fracionados mostram "0,350 kg". */
  unit?: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface ReceiptFiscal {
  status: string;
  numero?: string | number;
  serie?: string | number;
  chave?: string;
  protocolo?: string;
  qrcode_url?: string;
  danfe_url?: string;
  ambiente?: 'homologacao' | 'producao';
  emitido_em?: string;
  /** Motivo informado quando a nota é recusada (texto do governo). */
  mensagem?: string;
  /** Endereços dos XMLs na Focus (nota e cancelamento), usados na exportação para o contador. */
  xml_url?: string;
  xml_cancelamento_url?: string;
}

export interface ReceiptSale {
  id: string;
  number?: string;
  timestamp: string;
  items: ReceiptItem[];
  subtotal: number;
  payment_method: string;
  amount_paid?: number;
  change?: number;
  client?: { name?: string; cpf_cnpj?: string };
  operator?: string;
  fiscal?: ReceiptFiscal | null;
}

const STORAGE_KEY = 'laviola_printer_settings';
const LEGACY_STORAGE_KEY = 'donalu_printer_settings';

export const DEFAULT_COMPANY: ReceiptCompany = {
  name: 'LA VIOLA PETSHOP',
  address: 'Rua Dr. Ibraim Hannas, 406 - Campo Grande - RJ',
  phone: '(21) 97128-2945',
};

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  method: 'browser',
  paperSize: '80mm',
  copies: 1,
  baudRate: 9600,
  autoPrintOnSale: true,
  openDrawer: false,
};

// ---- Tipos mínimos das APIs de hardware do navegador (não existem no lib.dom) ----
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals?(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
  writable: { getWriter(): { write(data: Uint8Array): Promise<void>; releaseLock(): void } } | null;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
}
interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
  addEventListener(type: 'disconnect', cb: (e: { target: SerialPortLike }) => void): void;
}
interface UsbEndpointLike { endpointNumber: number; direction: 'in' | 'out'; type: string }
interface UsbDeviceLike {
  productName?: string;
  opened: boolean;
  configuration: { interfaces: { interfaceNumber: number; alternates: { endpoints: UsbEndpointLike[] }[] }[] } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: BufferSource): Promise<unknown>;
}
interface UsbLike {
  requestDevice(options: { filters: object[] }): Promise<UsbDeviceLike>;
  getDevices(): Promise<UsbDeviceLike[]>;
  addEventListener(type: 'disconnect', cb: (e: { device: UsbDeviceLike }) => void): void;
}
interface BtCharacteristicLike {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(data: Uint8Array): Promise<void>;
  writeValueWithoutResponse?(data: Uint8Array): Promise<void>;
}
interface BtDeviceLike {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<BtCharacteristicLike> }>;
      getPrimaryServices(): Promise<{ getCharacteristics(): Promise<BtCharacteristicLike[]> }[]>;
    }>;
    disconnect(): void;
  };
  addEventListener(type: 'gattserverdisconnected', cb: () => void): void;
}
interface BluetoothLike {
  requestDevice(options: { acceptAllDevices: boolean; optionalServices: string[] }): Promise<BtDeviceLike>;
}

const nav = (): Navigator & { serial?: SerialLike; usb?: UsbLike; bluetooth?: BluetoothLike } =>
  navigator as Navigator & { serial?: SerialLike; usb?: UsbLike; bluetooth?: BluetoothLike };

export function getPrinterSettings(): PrinterSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 'ethernet' nunca teve implementação no navegador (não há sockets TCP) — cai para o spooler.
      if (parsed.method === 'ethernet') parsed.method = 'browser';
      return { ...DEFAULT_PRINTER_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Erro ao ler configurações de impressão:', e);
  }
  return { ...DEFAULT_PRINTER_SETTINGS };
}

export function savePrinterSettings(settings: PrinterSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Erro ao salvar configurações de impressão:', e);
  }
}

// -------------------------------------------------------------
// Conexões ativas e listeners de estado
// -------------------------------------------------------------
type ConnectionCallback = (connected: boolean, name?: string) => void;

let activeBluetoothDevice: BtDeviceLike | null = null;
let activeBluetoothCharacteristic: BtCharacteristicLike | null = null;
let activeSerialPort: SerialPortLike | null = null;
let activeUsbDevice: UsbDeviceLike | null = null;
let activeUsbEndpoint = 0;

const btListeners = new Set<ConnectionCallback>();
const serialListeners = new Set<ConnectionCallback>();
const usbListeners = new Set<ConnectionCallback>();

const notify = (listeners: Set<ConnectionCallback>, connected: boolean, name: string) =>
  listeners.forEach(l => l(connected, name));

export const isBluetoothConnected = (): boolean =>
  !!(activeBluetoothDevice && activeBluetoothDevice.gatt?.connected && activeBluetoothCharacteristic);
export const getConnectedDeviceName = (): string => activeBluetoothDevice?.name || '';
export const isSerialConnected = (): boolean => !!activeSerialPort;
export const getConnectedSerialName = (): string => (activeSerialPort ? 'Impressora USB/Serial' : '');
export const isUsbConnected = (): boolean => !!activeUsbDevice;
export const getConnectedUsbName = (): string => activeUsbDevice?.productName || (activeUsbDevice ? 'Impressora USB' : '');

const notifyBt = () => notify(btListeners, isBluetoothConnected(), getConnectedDeviceName());
const notifySerial = () => notify(serialListeners, isSerialConnected(), getConnectedSerialName());
const notifyUsb = () => notify(usbListeners, isUsbConnected(), getConnectedUsbName());

function subscribe(set: Set<ConnectionCallback>, cb: ConnectionCallback, connected: boolean, name: string) {
  set.add(cb);
  cb(connected, name);
  return () => { set.delete(cb); };
}
export const subscribeToBluetoothState = (cb: ConnectionCallback) =>
  subscribe(btListeners, cb, isBluetoothConnected(), getConnectedDeviceName());
export const subscribeToSerialState = (cb: ConnectionCallback) =>
  subscribe(serialListeners, cb, isSerialConnected(), getConnectedSerialName());
export const subscribeToUsbState = (cb: ConnectionCallback) =>
  subscribe(usbListeners, cb, isUsbConnected(), getConnectedUsbName());

if (typeof navigator !== 'undefined') {
  nav().serial?.addEventListener('disconnect', (event) => {
    if (activeSerialPort && event.target === activeSerialPort) {
      activeSerialPort = null;
      notifySerial();
    }
  });
  nav().usb?.addEventListener('disconnect', (event) => {
    if (activeUsbDevice && event.device === activeUsbDevice) {
      activeUsbDevice = null;
      notifyUsb();
    }
  });
}

// -------------------------------------------------------------
// Bluetooth (BLE GATT)
// -------------------------------------------------------------
export async function connectPrinter(): Promise<string> {
  const bluetooth = nav().bluetooth;
  if (!bluetooth) {
    throw new Error('Web Bluetooth não é suportado neste navegador. Use Google Chrome, Edge ou Opera.');
  }

  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '000018f0-0000-1000-8000-00805f9b34fb',
    ],
  });

  const server = await device.gatt?.connect();
  if (!server) throw new Error('Não foi possível conectar ao servidor GATT do dispositivo.');

  let characteristic: BtCharacteristicLike | null = null;
  try {
    const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
    characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
  } catch {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const chars = await service.getCharacteristics();
      characteristic = chars.find(c => c.properties.write || c.properties.writeWithoutResponse) || null;
      if (characteristic) break;
    }
  }
  if (!characteristic) throw new Error('Não foi encontrada nenhuma característica de escrita no dispositivo pareado.');

  activeBluetoothDevice = device;
  activeBluetoothCharacteristic = characteristic;
  device.addEventListener('gattserverdisconnected', () => {
    activeBluetoothDevice = null;
    activeBluetoothCharacteristic = null;
    notifyBt();
  });
  notifyBt();
  return device.name || 'Impressora Bluetooth';
}

export function disconnectPrinter() {
  if (activeBluetoothDevice?.gatt?.connected) activeBluetoothDevice.gatt.disconnect();
  activeBluetoothDevice = null;
  activeBluetoothCharacteristic = null;
  notifyBt();
}

// -------------------------------------------------------------
// USB virtual COM (Web Serial)
// -------------------------------------------------------------
async function openSerialPort(port: SerialPortLike, baudRate: number) {
  try {
    await port.open({ baudRate });
  } catch (err) {
    // Porta já aberta por esta página (ex.: HMR) — segue com ela.
    if (!(err instanceof DOMException && err.name === 'InvalidStateError')) throw err;
  }
  try {
    // Muitas térmicas USB/Serial exigem DTR/RTS ativos.
    await port.setSignals?.({ dataTerminalReady: true, requestToSend: true });
  } catch (sigErr) {
    console.warn('Não foi possível definir sinais DTR/RTS na porta serial:', sigErr);
  }
  activeSerialPort = port;
  notifySerial();
}

export async function connectSerial(baudRate?: number): Promise<string> {
  const serial = nav().serial;
  if (!serial) throw new Error('Web Serial não é suportado neste navegador. Use Google Chrome ou Edge no computador.');
  const port = await serial.requestPort();
  await openSerialPort(port, baudRate || getPrinterSettings().baudRate || 9600);
  return 'Impressora USB (Serial)';
}

export async function disconnectSerial() {
  if (activeSerialPort) {
    try {
      await activeSerialPort.close();
    } catch (e) {
      console.error('Erro ao fechar porta serial:', e);
    }
  }
  activeSerialPort = null;
  notifySerial();
}

// -------------------------------------------------------------
// USB direto (WebUSB). No Windows só funciona se a impressora usar o driver WinUSB (ex.: via Zadig);
// com o driver de spooler do fabricante, use "Serial (COM)" ou "Navegador".
// -------------------------------------------------------------
async function openUsbDevice(device: UsbDeviceLike) {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);

  for (const iface of device.configuration?.interfaces || []) {
    const out = iface.alternates[0]?.endpoints.find(e => e.direction === 'out' && e.type === 'bulk');
    if (out) {
      await device.claimInterface(iface.interfaceNumber);
      activeUsbDevice = device;
      activeUsbEndpoint = out.endpointNumber;
      notifyUsb();
      return;
    }
  }
  throw new Error('Nenhum endpoint de saída encontrado neste dispositivo USB.');
}

export async function connectUsb(): Promise<string> {
  const usb = nav().usb;
  if (!usb) throw new Error('WebUSB não é suportado neste navegador. Use Google Chrome ou Edge no computador.');
  const device = await usb.requestDevice({ filters: [] });
  try {
    await openUsbDevice(device);
  } catch (err) {
    throw new Error(
      `Não foi possível abrir a impressora via USB direto (${err instanceof Error ? err.message : err}). ` +
      'No Windows o driver do fabricante bloqueia o acesso — use o método "USB Serial (COM)" ou "Navegador".',
      { cause: err }
    );
  }
  return getConnectedUsbName();
}

export async function disconnectUsb() {
  try {
    await activeUsbDevice?.close();
  } catch (e) {
    console.error('Erro ao fechar dispositivo USB:', e);
  }
  activeUsbDevice = null;
  notifyUsb();
}

/** Reabre sozinha a impressora já autorizada anteriormente (sem novo clique em "Conectar"). */
export async function restorePrinterConnection(): Promise<void> {
  const settings = getPrinterSettings();
  try {
    if (settings.method === 'serial' && !activeSerialPort) {
      const ports = (await nav().serial?.getPorts()) || [];
      if (ports[0]) await openSerialPort(ports[0], settings.baudRate || 9600);
    } else if (settings.method === 'usb' && !activeUsbDevice) {
      const devices = (await nav().usb?.getDevices()) || [];
      if (devices[0]) await openUsbDevice(devices[0]);
    }
  } catch (e) {
    console.warn('Não foi possível restaurar a conexão da impressora:', e);
  }
}

// -------------------------------------------------------------
// Construtor ESC/POS (também guarda o texto puro para o fallback do navegador)
// -------------------------------------------------------------
class EscPosBuilder {
  private bytes: number[] = [0x1b, 0x40];
  private plain: string[] = [];
  readonly width: number;

  constructor(paperSize: '58mm' | '80mm') {
    this.width = paperSize === '80mm' ? 48 : 32;
  }

  private clean(text: string) {
    // Sem mapa de fontes: remove acentos para imprimir igual em qualquer térmica.
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^ -~]/g, '');
  }

  private raw(...b: number[]) { this.bytes.push(...b); return this; }

  align(a: 'left' | 'center' | 'right') { return this.raw(0x1b, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2); }
  bold(on: boolean) { return this.raw(0x1b, 0x45, on ? 1 : 0); }
  big(on: boolean) { return this.raw(0x1d, 0x21, on ? 0x11 : 0x00); }

  line(text = '') {
    const c = this.clean(text);
    this.plain.push(c);
    this.bytes.push(...new TextEncoder().encode(c), 0x0a);
    return this;
  }

  wrap(text: string, indent = '') {
    const max = this.width - indent.length;
    const words = this.clean(text).split(' ');
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > max) {
        this.line(indent + cur);
        cur = w;
      } else {
        cur = (cur + ' ' + w).trim();
      }
    }
    if (cur) this.line(indent + cur);
    return this;
  }

  /** `scale` = 2 quando o texto está em tamanho duplo (cabe metade das colunas). */
  row(left: string, right: string, scale = 1) {
    const l = this.clean(left);
    const r = this.clean(right);
    const room = Math.floor(this.width / scale) - r.length - 1;
    return this.line(`${l.length > room ? l.slice(0, room) : l.padEnd(room)} ${r}`);
  }

  divider(ch = '-') { return this.line(ch.repeat(this.width)); }

  qr(data: string, size = 6) {
    const d = new TextEncoder().encode(data);
    const len = d.length + 3;
    this.raw(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    this.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size);
    this.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    this.raw(0x1d, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...d);
    this.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    this.plain.push(data);
    return this;
  }

  drawer() { return this.raw(0x1b, 0x70, 0x00, 0x19, 0xfa); }

  finish(cut: boolean) {
    this.raw(0x1b, 0x64, cut ? 0x04 : 0x08);
    if (cut) this.raw(0x1d, 0x56, 0x42, 0x00);
    return new Uint8Array(this.bytes);
  }

  text() { return this.plain.join('\n'); }
}

const brl = (n: number) => `R$ ${(n || 0).toFixed(2).replace('.', ',')}`;

export function formatCpfCnpj(v?: string): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return v || '';
}

const formatChave = (c: string) => c.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim();

function buildReceipt(sale: ReceiptSale, company: ReceiptCompany, settings: PrinterSettings) {
  const b = new EscPosBuilder(settings.paperSize);
  const fiscal = sale.fiscal && sale.fiscal.status === 'autorizada' ? sale.fiscal : null;

  b.align('center').bold(true).line(company.name).bold(false);
  if (company.cnpj) b.line(`CNPJ: ${formatCpfCnpj(company.cnpj)}${company.ie ? `  IE: ${company.ie}` : ''}`);
  if (company.address) b.wrap(company.address);
  if (company.phone) b.line(`Tel: ${company.phone}`);
  b.divider();

  b.bold(true).line(fiscal ? 'DANFE NFC-e - Documento Auxiliar' : 'CUPOM NAO FISCAL').bold(false);
  if (fiscal) b.line('da Nota Fiscal de Consumidor Eletronica');
  if (fiscal?.ambiente === 'homologacao') b.bold(true).line('EMITIDA EM HOMOLOGACAO - SEM VALOR FISCAL').bold(false);
  b.divider();

  b.align('left');
  b.line(`Data: ${new Date(sale.timestamp).toLocaleString('pt-BR')}`);
  b.line(`Venda: #${sale.number || sale.id}`);
  if (sale.operator) b.line(`Operador: ${sale.operator}`);
  b.divider();

  b.bold(true).row('ITEM', 'TOTAL').bold(false);
  sale.items.forEach((it, i) => {
    b.wrap(`${String(i + 1).padStart(2, '0')} ${it.name}`);
    b.row(`   ${formatQty(it.quantity, it.unit)} x ${brl(it.price)}${isFractional(it.unit) ? `/${unitShort(it.unit)}` : ''}`, brl(it.subtotal));
  });
  b.divider();

  const qty = sale.items.reduce((a, it) => a + (isFractional(it.unit) ? 1 : it.quantity), 0);
  b.row('Qtd. itens', String(qty));
  b.bold(true).big(true).row('TOTAL', brl(sale.subtotal), 2).big(false).bold(false);
  b.row('Pagamento', sale.payment_method);
  if (sale.payment_method === 'Dinheiro' && sale.amount_paid) {
    b.row('Valor pago', brl(sale.amount_paid));
    b.row('Troco', brl(sale.change || 0));
  }
  b.divider();

  const doc = sale.client?.cpf_cnpj;
  if (doc) b.line(`${sale.client?.name ? sale.client.name + ' - ' : ''}CPF/CNPJ: ${formatCpfCnpj(doc)}`);
  else b.line('CONSUMIDOR NAO IDENTIFICADO');

  if (fiscal) {
    b.divider();
    b.align('center');
    b.line(`NFC-e n ${fiscal.numero ?? '-'}  Serie ${fiscal.serie ?? '-'}`);
    if (fiscal.emitido_em) b.line(new Date(fiscal.emitido_em).toLocaleString('pt-BR'));
    b.line('Chave de acesso:');
    b.wrap(formatChave(fiscal.chave || ''));
    if (fiscal.protocolo) b.line(`Protocolo: ${fiscal.protocolo}`);
    if (fiscal.qrcode_url) {
      b.line();
      b.qr(fiscal.qrcode_url);
      b.line('Consulte pela chave de acesso no site da SEFAZ');
    }
  }

  b.align('center').line().line('Obrigado pela preferencia!').line('Volte sempre :)');
  return b;
}

// -------------------------------------------------------------
// Envio para o hardware
// -------------------------------------------------------------
async function sendBluetooth(data: Uint8Array) {
  const char = activeBluetoothCharacteristic;
  if (!isBluetoothConnected() || !char) throw new Error('A impressora Bluetooth está desconectada. Conecte-a nas Configurações.');
  const noResponse = !!(char.properties.writeWithoutResponse && char.writeValueWithoutResponse);
  const chunkSize = noResponse ? 100 : 20;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    if (noResponse) await char.writeValueWithoutResponse!(chunk);
    else await char.writeValue(chunk);
    await new Promise(r => setTimeout(r, 20));
  }
}

async function sendSerial(data: Uint8Array) {
  if (!activeSerialPort?.writable) throw new Error('A impressora USB (COM) está desconectada. Conecte-a nas Configurações.');
  const writer = activeSerialPort.writable.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
}

async function sendUsb(data: Uint8Array) {
  if (!activeUsbDevice) throw new Error('A impressora USB está desconectada. Conecte-a nas Configurações.');
  const chunk = 16384;
  for (let i = 0; i < data.length; i += chunk) {
    await activeUsbDevice.transferOut(activeUsbEndpoint, data.slice(i, i + chunk));
  }
}

function printTextBrowser(text: string, settings: PrinterSettings) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:absolute;width:0;height:0;border:none;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) throw new Error('Não foi possível abrir o documento de impressão.');

  const w = settings.paperSize === '58mm' ? '56mm' : '78mm';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  doc.open();
  doc.write(`<html><head><style>
    @page { margin: 0; size: ${w} auto; }
    body { margin: 0; padding: 2mm; width: ${w}; font-family: 'Courier New', monospace; font-size: 11px; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
  </style></head><body><pre>${escaped}</pre></body></html>`);
  doc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 2000);
  }, 200);
}

async function dispatch(builder: EscPosBuilder, settings: PrinterSettings) {
  const data = builder.finish(settings.paperSize === '80mm');
  for (let i = 0; i < Math.max(1, settings.copies); i++) {
    if (settings.method === 'bluetooth') await sendBluetooth(data);
    else if (settings.method === 'serial') await sendSerial(data);
    else if (settings.method === 'usb') await sendUsb(data);
    else printTextBrowser(builder.text(), settings);
  }
}

/** Imprime o cupom da venda (não fiscal) ou o DANFE NFC-e quando a venda traz `fiscal` autorizada. */
export async function printSaleReceipt(sale: ReceiptSale, company: ReceiptCompany = DEFAULT_COMPANY): Promise<void> {
  const settings = getPrinterSettings();
  const builder = buildReceipt(sale, company, settings);
  if (settings.openDrawer && sale.payment_method === 'Dinheiro' && settings.method !== 'browser') {
    const drawerBytes = new EscPosBuilder(settings.paperSize).drawer().finish(false);
    if (settings.method === 'bluetooth') await sendBluetooth(drawerBytes);
    else if (settings.method === 'serial') await sendSerial(drawerBytes);
    else if (settings.method === 'usb') await sendUsb(drawerBytes);
  }
  await dispatch(builder, settings);
}

export async function printMockOrder(): Promise<void> {
  const items: ReceiptItem[] = [
    { name: 'Racao Premium Caes Adultos 15kg', sku: '7890000000001', quantity: 1, price: 189.9, subtotal: 189.9 },
    { name: 'Shampoo Neutro 500ml', sku: '7890000000002', quantity: 2, price: 24.5, subtotal: 49 },
    { name: 'Petisco Bifinho 65g', sku: '7890000000003', quantity: 3, price: 6.9, subtotal: 20.7 },
  ];
  const subtotal = items.reduce((a, i) => a + i.subtotal, 0);
  return printSaleReceipt({
    id: 'TESTE',
    timestamp: new Date().toISOString(),
    items,
    subtotal,
    payment_method: 'Dinheiro',
    amount_paid: 300,
    change: 300 - subtotal,
    client: {},
    operator: 'Teste de impressao',
  });
}
