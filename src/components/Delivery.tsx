import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Clock, MapPin, Search, Truck, Navigation, Phone, MessageCircle, AlertCircle, LifeBuoy, X, CheckCircle, Package, PlusCircle, Eye, EyeOff, Trash2, Map, Compass, Play, ShoppingCart, Barcode, Minus, Plus } from 'lucide-react';
import { DeliveryMap, type MapAddress } from './DeliveryMap';
import { logAction, supabase, isSupabaseConfigured, mockSupabaseDb } from '../supabaseClient';
import type { Product } from '../supabaseClient';
import type { AuthUser } from '../hooks/useAuth';
import { formatPhoneBR } from '../utils/formatters';
import { isDeliverySpecialty } from '../utils/specialties';
import { notifyDriver } from '../utils/push';
import { QuantityDialog } from './QuantityDialog';
import { searchProducts } from '../utils/productSearch';
import { describeItem, escapeHtml, formatQty, isFractional, lineTotal, priceLabel, roundQty } from '../utils/units';
import { PushSetup } from './PushSetup';
import { DeliveryPaymentBox } from './DeliveryPaymentBox';
import { PAYMENT_METHODS, brl, changeToGive, parseMoney, paymentText, stripPaymentTag, usesCardMachine, validatePayment } from '../utils/deliveryPayment';
import type { DeliveryPayment, PaymentMethod } from '../utils/deliveryPayment';
import { subscribeDeliveries, syncDeliveries, patchDelivery } from '../utils/deliveriesService';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { db, secondaryAuth, isFirebaseConfigured } from '../firebaseClient';
import { checkEmailExists, checkPhoneExists, checkUsernameExists } from '../utils/userValidation';

// Senha já preenchida no cadastro de cliente; o operador pode trocar se quiser.
// Senha temporária para cliente novo: sorteada a cada cadastro (não é mais um valor fixo como "123456" que qualquer
// um poderia tentar). O cliente é obrigado a trocá-la no primeiro login, então ela só precisa durar até lá.
const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // sem 0/O/1/I/l, pra não confundir na hora de ler
const generateTempPassword = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => TEMP_PASSWORD_CHARS[b % TEMP_PASSWORD_CHARS.length]).join('');
};

// Declare Leaflet global object L
declare const L: any;

interface DeliveryProps {
  styles: any;
  currentUser: AuthUser | null;
}

/** Pedido do entregador para iniciar uma entrega antes da hora liberada. */
export interface StartRequest {
  status: 'pendente' | 'aprovada' | 'recusada';
  requested_at: string;
  requested_by_name: string;
  decided_at?: string;
  decided_by_name?: string;
}

/** O entregador só pode iniciar a entrega agendada a partir de tantos minutos antes do horário marcado. */
export const EARLY_START_MINUTES = 30;

export interface StartGate {
  allowed: boolean;
  /** Instante em que a entrega é liberada; nulo quando não há horário marcado. */
  opensAt: Date | null;
  /** Liberada por autorização do gerente (e não pelo relógio). */
  authorized?: boolean;
}

export function getStartGate(
  d: { scheduled_at?: string | null; start_request?: StartRequest | null },
  now: number = Date.now()
): StartGate {
  if (!d.scheduled_at) return { allowed: true, opensAt: null };
  const opensAt = new Date(new Date(d.scheduled_at).getTime() - EARLY_START_MINUTES * 60000);
  if (now >= opensAt.getTime()) return { allowed: true, opensAt };
  if (d.start_request?.status === 'aprovada') return { allowed: true, opensAt, authorized: true };
  return { allowed: false, opensAt };
}

const fmtWhen = (date: Date) =>
  date.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export interface DeliveryItem {
  id: string;
  client_id: string;
  client_name: string;
  client_address: string;
  client_lat: number;
  client_lng: number;
  driver_id: string;
  driver_name: string;
  driver_lat: number;
  driver_lng: number;
  status: 'agendada' | 'a-caminho' | 'concluida' | 'cancelada';
  items: string;
  scheduled_time: string;
  created_at: string;
  support_reason?: string | null;
  support_decision?: string | null;
  driver_returned?: boolean | null;
  /** Horário marcado em formato exato (ISO); vazio = "o mais breve possível". */
  scheduled_at?: string | null;
  start_request?: StartRequest | null;
  /** Como a entrega é paga (já paga ou a cobrar na porta, com forma de pagamento e troco). */
  payment?: DeliveryPayment | null;
  /** Endereço separado em partes, para o operador reaproveitar nos próximos pedidos do cliente. */
  address_parts?: { street: string; number: string; neighborhood: string; reference: string };
}

interface PastAddress {
  key: string;
  street: string;
  number: string;
  neighborhood: string;
  reference: string;
  lat: number;
  lng: number;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/** Endereços que o cliente já pediu (mais recente primeiro, sem repetir, só os que têm coordenada salva). */
function pastAddressesOf(deliveries: DeliveryItem[], clientId: string, limit = 5): PastAddress[] {
  if (!clientId) return [];
  const seen = new Set<string>();
  const out: PastAddress[] = [];
  const mine = deliveries.filter(d => d.client_id === clientId).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  for (const d of mine) {
    const atShop = Math.abs(d.client_lat - PETSHOP_COORDS.lat) < 1e-6 && Math.abs(d.client_lng - PETSHOP_COORDS.lng) < 1e-6;
    if (!Number.isFinite(d.client_lat) || !Number.isFinite(d.client_lng) || atShop) continue;
    let parts = d.address_parts;
    if (!parts) {
      const m = /^(.*), (.*) - (.*)$/.exec(d.client_address || '');
      if (!m) continue;
      parts = { street: m[1], number: m[2], neighborhood: m[3], reference: '' };
    }
    const key = `${norm(parts.street)}|${norm(parts.number)}|${norm(parts.neighborhood)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, ...parts, lat: d.client_lat, lng: d.client_lng });
    if (out.length >= limit) break;
  }
  return out;
}

const PETSHOP_COORDS = { lat: -22.9122, lng: -43.5606 }; // Rua Dr. Ibraim Hannas, 406 - Campo Grande

// Predefined nearby client destinations in Campo Grande for easy selection
const PREDEFINED_LOCATIONS = [
  { name: 'Rua Arthur Rios, 1200', lat: -22.8995, lng: -43.5580 },
  { name: 'Avenida Cesário de Melo, 2500', lat: -22.9025, lng: -43.5610 },
  { name: 'Rua Viúva Dantas, 350', lat: -22.9050, lng: -43.5560 },
  { name: 'Estrada da Caroba, 500', lat: -22.8920, lng: -43.5600 },
  { name: 'Estrada do Cabuçu, 800', lat: -22.8912, lng: -43.5685 }
];

const SUPPORT_REASONS = [
  "Local fechado, ninguém atende",
  "Problemas com o pagamento do cliente",
  "O veículo parou de funcionar",
  "Sofri um acidente no percurso",
  "Endereço incorreto / não localizado",
  "Cliente recusou receber o produto",
  "Produto quebrado, derramado ou danificado",
  "Sem sinal de internet / GPS oscilando"
];

const DECISIONS_BY_REASON: Record<string, string[]> = {
  "Local fechado, ninguém atende": [
    "Aguardar 10 minutos no local e tentar contato telefônico",
    "Deixar com vizinho autorizado",
    "Entrega cancelada. Retorne à base"
  ],
  "Problemas com o pagamento do cliente": [
    "Solicitar pagamento via Pix/Link e aguardar confirmação",
    "Permitir pagamento na próxima entrega (autorizado pelo financeiro)",
    "Entrega cancelada. Retorne à base"
  ],
  "O veículo parou de funcionar": [
    "Aguardar no local, outro entregador irá buscar a mercadoria",
    "Aguardar reboque / assistência mecânica",
    "Entrega cancelada. Retorne à base"
  ],
  "Sofri um acidente no percurso": [
    "Priorizar socorro médico. Aguardar resgate no local",
    "Aguardar reboque e suporte da empresa no local",
    "Entrega cancelada. Retorne à base"
  ],
  "Endereço incorreto / não localizado": [
    "Entrar em contato com o cliente para obter ponto de referência",
    "Buscar endereço correto no Google Maps / perguntar na vizinhança",
    "Entrega cancelada. Retorne à base"
  ],
  "Cliente recusou receber o produto": [
    "Verificar motivo da recusa com o cliente e reportar ao gerente",
    "Entrega cancelada. Retorne à base"
  ],
  "Produto quebrado, derramado ou danificado": [
    "Retornar à base para efetuar a troca do produto",
    "Entregar itens não danificados e gerar cupom de desconto",
    "Entrega cancelada. Retorne à base"
  ],
  "Sem sinal de internet / GPS oscilando": [
    "Prosseguir com a entrega seguindo o endereço físico anotado",
    "Aguardar sinal em local seguro / reiniciar aplicativo",
    "Entrega cancelada. Retorne à base"
  ]
};

export const Delivery: React.FC<DeliveryProps> = ({ styles, currentUser }) => {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryItem | null>(null);

  // Form scheduling states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formClientId, setFormClientId] = useState<string>('');
  const [formDriverId, setFormDriverId] = useState<string>('');
  const [formItems, setFormItems] = useState<string>('');
  
  // Cart & Products states
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<{product: Product, quantity: number}[]>([]);
  const [skuInput, setSkuInput] = useState<string>('');
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [isProductSearching, setIsProductSearching] = useState<boolean>(false);
  const skuInputRef = useRef<HTMLInputElement>(null);
  
  const [addressStreet, setAddressStreet] = useState<string>('');
  const [addressNumber, setAddressNumber] = useState<string>('');
  const [addressNeighborhood, setAddressNeighborhood] = useState<string>('');
  const [addressReference, setAddressReference] = useState<string>('');
  const [addressLat, setAddressLat] = useState<number>(PETSHOP_COORDS.lat);
  const [addressLng, setAddressLng] = useState<number>(PETSHOP_COORDS.lng);
  
  const [deliveryAsap, setDeliveryAsap] = useState<boolean>(true);
  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [deliveryTime, setDeliveryTime] = useState<string>('');
  const [deliveryObs, setDeliveryObs] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<string>('Já Pago');
  const [payMethod, setPayMethod] = useState<PaymentMethod | ''>('');
  const [needsChange, setNeedsChange] = useState<boolean>(false);
  const [changeFor, setChangeFor] = useState<string>('');
  const resetPaymentForm = () => {
    setPaymentStatus('Já Pago');
    setPayMethod('');
    setNeedsChange(false);
    setChangeFor('');
  };
  const [deliverySlots, setDeliverySlots] = useState<{days: {value: string, label: string}[], timesByDay: Record<string, string[]>}>({days: [], timesByDay: {}});

  // New Client Modal states
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [newClientFullName, setNewClientFullName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientUsername, setNewClientUsername] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientPassword, setNewClientPassword] = useState(generateTempPassword);
  const [showClientPassword, setShowClientPassword] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);

  // Simulation settings
  const [simSpeed, setSimSpeed] = useState<number>(1); // 1x, 5x, 10x speed factor

  // Manager filter states
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDriver, setFilterDriver] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLocationApproximate, setIsLocationApproximate] = useState(false);
  const [supportModalDelivery, setSupportModalDelivery] = useState<DeliveryItem | null>(null);
  const [managerSupportModalDelivery, setManagerSupportModalDelivery] = useState<DeliveryItem | null>(null);
  const [selectedDecisionOption, setSelectedDecisionOption] = useState<string>('');
  const [customDecisionText, setCustomDecisionText] = useState<string>('');

  const [trackingDelivery, setTrackingDelivery] = useState<DeliveryItem | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const markersRef = useRef<{ petshop?: any; driver?: any; client?: any }>({});

  const trackingMapContainerRef = useRef<HTMLDivElement | null>(null);
  const trackingMapInstanceRef = useRef<any>(null);
  const trackingRouteLineRef = useRef<any>(null);
  const trackingMarkersRef = useRef<{ petshop?: any; driver?: any; client?: any }>({});

  const role = currentUser?.profile?.role || 'client';
  const isManager = role === 'developer' || role === 'owner' || role === 'manager';
  const isDriver = role === 'collaborator';
  const isClient = role === 'client';

  // As entregas ficam no Firestore e chegam em tempo real para todos (dono, entregador, cliente).
  // O cliente só recebe as próprias; a equipe recebe todas.
  const isStaffRole = isManager || isDriver;

  useEffect(() => {
    if (!currentUser?.id) return;
    return subscribeDeliveries(
      { uid: currentUser.id, staff: isStaffRole },
      setDeliveries,
      (err) => console.error('Erro ao carregar entregas:', err)
    );
  }, [currentUser?.id, isStaffRole]);

  // Grava no servidor o que mudou na lista (a tela já mostra o resultado na hora).
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const persistDeliveries = async (previous: DeliveryItem[], next: DeliveryItem[]) => {
    try {
      await syncDeliveries(previous, next);
    } catch (err) {
      console.error('Erro ao salvar entrega:', err);
      alert('Não foi possível salvar a alteração da entrega. Verifique a internet e tente de novo.');
    }
  };

  // Clientes e entregadores vêm dos cadastros reais, não de dados de teste guardados no navegador.
  useEffect(() => {
    if (!db || !isStaffRole) return;
    let cancelled = false;
    getDocs(collection(db, 'profiles'))
      .then(snap => {
        if (cancelled) return;
        const normRole = (r: string) => (r === 'cliente' ? 'client' : r === 'colaborador' ? 'collaborator' : r);
        const profiles = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter(p => p.is_active !== false);
        const nameOf = (p: any, fallback: string) => p.full_name || p.name || p.username || fallback;

        setClients(profiles.filter(p => normRole(p.role) === 'client').map(p => ({ id: p.id, name: nameOf(p, 'Cliente') })));

        // Só colaboradores com a especialidade "Entregador / Delivery" podem receber entregas.
        const deliveryDrivers = profiles.filter(p => normRole(p.role) === 'collaborator' && isDeliverySpecialty(p.collaborator_specialty));
        setDrivers(deliveryDrivers.map(p => ({ id: p.id, name: nameOf(p, 'Entregador') })));
      })
      .catch(err => console.error('Erro ao carregar clientes e entregadores:', err));
    return () => { cancelled = true; };
  }, [isStaffRole]);

  // Sync selected delivery reference when the list updates
  useEffect(() => {
    if (selectedDelivery) {
      const current = deliveries.find(d => d.id === selectedDelivery.id);
      if (current) {
        setSelectedDelivery(current);
      }
    }
  }, [deliveries]);

  // Sync tracking delivery reference when the list updates
  useEffect(() => {
    if (trackingDelivery) {
      const current = deliveries.find(d => d.id === trackingDelivery.id);
      if (current) {
        setTrackingDelivery(current);
      }
    }
  }, [deliveries]);

  // GPS Tracking for active Driver (updates coordinates using physical device GPS in real-time)
  useEffect(() => {
    if (!isDriver || !currentUser?.id) return;

    // Find active delivery assigned to this driver
    const activeDelivery = deliveries.find(
      d => d.driver_id === currentUser.id && d.status === 'a-caminho'
    );
    const activeDeliveryId = activeDelivery?.id;

    if (!activeDeliveryId) return;

    if (typeof window === 'undefined' || !navigator.geolocation) {
      console.warn('Geolocalização não é suportada por este dispositivo.');
      return;
    }

    let lastUpdate = 0;

    const handleSuccess = async (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;

      // Accuracy > 150 meters typically indicates OS Approximate Location is active
      if (accuracy && accuracy > 150) {
        setIsLocationApproximate(true);
      } else {
        setIsLocationApproximate(false);
      }

      const now = Date.now();

      // Throttle updates to at most once every 3 seconds to avoid spamming the database
      if (now - lastUpdate < 3000) return;
      lastUpdate = now;

      try {
        await patchDelivery(activeDeliveryId, { driver_lat: latitude, driver_lng: longitude });
      } catch (err) {
        console.error('Erro ao atualizar a posição do GPS:', err);
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      console.error('Erro ao obter posição de GPS:', error.message);
      // If permission denied or other error, clear approximate warnings
      setIsLocationApproximate(false);
    };

    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setIsLocationApproximate(false);
    };
  }, [isDriver, currentUser?.id, deliveries.find(d => d.driver_id === currentUser?.id && d.status === 'a-caminho')?.id]);

  // Leaflet Map Rendering and Updates
  useEffect(() => {
    let active = true;

    // If Leaflet library L is not loaded yet or container is missing, skip
    if (typeof window === 'undefined' || !(window as any).L || !mapContainerRef.current || !selectedDelivery) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    const mapContainer = mapContainerRef.current;
    
    // Create Custom SVG icons (Circular flat vector markers matching site styles)
    const petshopIcon = L.divIcon({
      html: `<div style="background-color: hsl(210, 85%, 45%); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></div>`,
      className: 'custom-petshop-icon',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const clientIcon = L.divIcon({
      html: `<div style="background-color: hsl(0, 75%, 50%); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>`,
      className: 'custom-client-icon',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const driverIcon = L.divIcon({
      html: `<div style="background-color: hsl(36, 95%, 55%); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg></div>`,
      className: 'custom-driver-icon',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const setupMap = async () => {
      // Fetch OSRM route from shop to client
      let routeCoords: [number, number][] = [
        [PETSHOP_COORDS.lat, PETSHOP_COORDS.lng],
        [selectedDelivery.client_lat, selectedDelivery.client_lng]
      ];

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${PETSHOP_COORDS.lng},${PETSHOP_COORDS.lat};${selectedDelivery.client_lng},${selectedDelivery.client_lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (res.ok && active) {
          const data = await res.json();
          if (data.routes && data.routes.length > 0) {
            const coords = data.routes[0].geometry.coordinates;
            routeCoords = coords.map((c: any) => [c[1], c[0]]);
          }
        }
      } catch (err) {
        console.error('Error fetching OSRM route in Delivery:', err);
      }

      if (!active) return;

      // Create map instance if it does not exist
      if (!mapInstanceRef.current) {
        const initialCenter = [
          (PETSHOP_COORDS.lat + selectedDelivery.client_lat) / 2,
          (PETSHOP_COORDS.lng + selectedDelivery.client_lng) / 2
        ];

        const map = L.map(mapContainer).setView(initialCenter, 15);
        mapInstanceRef.current = map;

        // Google Maps standard roadmap tiles
        L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
          attribution: 'Map data © Google'
        }).addTo(map);

        // Add petshop marker
        markersRef.current.petshop = L.marker([PETSHOP_COORDS.lat, PETSHOP_COORDS.lng], { icon: petshopIcon })
          .addTo(map)
          .bindPopup('<b>Petshop La Viola</b><br>Origem das Entregas');

        // Add client marker
        markersRef.current.client = L.marker([selectedDelivery.client_lat, selectedDelivery.client_lng], { icon: clientIcon })
          .addTo(map)
          .bindPopup(`<b>Cliente: ${escapeHtml(selectedDelivery.client_name)}</b><br>${escapeHtml(selectedDelivery.client_address)}`);

        // Add driver marker if dispatched
        if (selectedDelivery.driver_id) {
          markersRef.current.driver = L.marker([selectedDelivery.driver_lat, selectedDelivery.driver_lng], { icon: driverIcon })
            .addTo(map)
            .bindPopup(`<b>Entregador: ${escapeHtml(selectedDelivery.driver_name)}</b>`);
        }

        // Add route polyline using street coordinates
        routeLineRef.current = L.polyline(routeCoords, { color: '#3b82f6', weight: 4, opacity: 0.8 }).addTo(map);

        // Fit map bounds to show both shop and destination
        const bounds = L.latLngBounds([
          [PETSHOP_COORDS.lat, PETSHOP_COORDS.lng],
          [selectedDelivery.client_lat, selectedDelivery.client_lng]
        ]);
        map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        // If map already exists, just update driver & client coordinates dynamically
        const map = mapInstanceRef.current;
        
        if (selectedDelivery.driver_id) {
          if (markersRef.current.driver) {
            markersRef.current.driver.setLatLng([selectedDelivery.driver_lat, selectedDelivery.driver_lng]);
            markersRef.current.driver.setPopupContent(`<b>Entregador: ${escapeHtml(selectedDelivery.driver_name)}</b>`);
          } else {
            markersRef.current.driver = L.marker([selectedDelivery.driver_lat, selectedDelivery.driver_lng], { icon: driverIcon })
              .addTo(map)
              .bindPopup(`<b>Entregador: ${escapeHtml(selectedDelivery.driver_name)}</b>`);
          }
        } else {
          if (markersRef.current.driver) {
            map.removeLayer(markersRef.current.driver);
            markersRef.current.driver = null;
          }
        }
        
        if (markersRef.current.client) {
          markersRef.current.client.setLatLng([selectedDelivery.client_lat, selectedDelivery.client_lng]);
        }

        // Adjust line route representation from driver to client using street coordinates
        if (routeLineRef.current) {
          routeLineRef.current.setLatLngs(routeCoords);
        }
      }
    };

    setupMap();

    return () => {
      active = false;
    };
  }, [selectedDelivery?.id, selectedDelivery?.driver_id, selectedDelivery?.driver_lat, selectedDelivery?.driver_lng]);

  // Side-effect cleanup when selected delivery is closed/swapped
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current = {};
        routeLineRef.current = null;
      }
    };
  }, [selectedDelivery === null]);

  // Leaflet Map for real-time tracking modal
  useEffect(() => {
    let active = true;

    // If Leaflet library L is not loaded yet, or container is missing, or tracking is disabled, cleanup and skip
    if (typeof window === 'undefined' || !(window as any).L || !trackingMapContainerRef.current || !trackingDelivery) {
      if (trackingMapInstanceRef.current) {
        try {
          trackingMapInstanceRef.current.remove();
        } catch (e) {
          console.warn('Error removing map instance:', e);
        }
        trackingMapInstanceRef.current = null;
        trackingMarkersRef.current = {};
        trackingRouteLineRef.current = null;
      }
      return;
    }

    const mapContainer = trackingMapContainerRef.current;
    
    // Create Custom SVG icons (Circular flat vector markers matching site styles)
    const petshopIcon = L.divIcon({
      html: `<div style="background-color: hsl(210, 85%, 45%); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></div>`,
      className: 'custom-petshop-icon',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const clientIcon = L.divIcon({
      html: `<div style="background-color: hsl(0, 75%, 50%); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>`,
      className: 'custom-client-icon',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const driverIcon = L.divIcon({
      html: `<div style="background-color: hsl(36, 95%, 55%); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg></div>`,
      className: 'custom-driver-icon',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const setupMap = async () => {
      // Fetch OSRM route from shop to client
      let routeCoords: [number, number][] = [
        [PETSHOP_COORDS.lat, PETSHOP_COORDS.lng],
        [trackingDelivery.client_lat, trackingDelivery.client_lng]
      ];

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${PETSHOP_COORDS.lng},${PETSHOP_COORDS.lat};${trackingDelivery.client_lng},${trackingDelivery.client_lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (res.ok && active) {
          const data = await res.json();
          if (data.routes && data.routes.length > 0) {
            const coords = data.routes[0].geometry.coordinates;
            routeCoords = coords.map((c: any) => [c[1], c[0]]);
          }
        }
      } catch (err) {
        console.error('Error fetching OSRM route in tracking modal:', err);
      }

      if (!active) return;

      // Create map instance if it does not exist
      if (!trackingMapInstanceRef.current) {
        const initialCenter = [
          (PETSHOP_COORDS.lat + trackingDelivery.client_lat) / 2,
          (PETSHOP_COORDS.lng + trackingDelivery.client_lng) / 2
        ];

        const map = L.map(mapContainer).setView(initialCenter, 15);
        trackingMapInstanceRef.current = map;

        // Google Maps standard roadmap tiles
        L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
          attribution: 'Map data © Google'
        }).addTo(map);

        // Add petshop marker (Store / Loja / Origem)
        trackingMarkersRef.current.petshop = L.marker([PETSHOP_COORDS.lat, PETSHOP_COORDS.lng], { icon: petshopIcon })
          .addTo(map)
          .bindPopup('<b>Petshop La Viola (Loja / Origem)</b><br>Ponto de partida da entrega');

        // Add client marker (Destino)
        trackingMarkersRef.current.client = L.marker([trackingDelivery.client_lat, trackingDelivery.client_lng], { icon: clientIcon })
          .addTo(map)
          .bindPopup(`<b>Destino (Cliente): ${escapeHtml(trackingDelivery.client_name)}</b><br>${escapeHtml(trackingDelivery.client_address)}`);

        // Add driver marker if dispatched
        if (trackingDelivery.driver_id) {
          trackingMarkersRef.current.driver = L.marker([trackingDelivery.driver_lat, trackingDelivery.driver_lng], { icon: driverIcon })
            .addTo(map)
            .bindPopup(`<b>Entregador (Tempo Real): ${escapeHtml(trackingDelivery.driver_name)}</b>`);
        }

        // Add route polyline using street coordinates
        trackingRouteLineRef.current = L.polyline(routeCoords, { color: '#3b82f6', weight: 4, opacity: 0.8 }).addTo(map);

        // Fit map bounds to show both shop and destination
        const bounds = L.latLngBounds([
          [PETSHOP_COORDS.lat, PETSHOP_COORDS.lng],
          [trackingDelivery.client_lat, trackingDelivery.client_lng]
        ]);
        map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        // If map already exists, just update driver & client coordinates dynamically
        const map = trackingMapInstanceRef.current;
        
        if (trackingDelivery.driver_id) {
          if (trackingMarkersRef.current.driver) {
            trackingMarkersRef.current.driver.setLatLng([trackingDelivery.driver_lat, trackingDelivery.driver_lng]);
            trackingMarkersRef.current.driver.setPopupContent(`<b>Entregador (Tempo Real): ${escapeHtml(trackingDelivery.driver_name)}</b>`);
          } else {
            trackingMarkersRef.current.driver = L.marker([trackingDelivery.driver_lat, trackingDelivery.driver_lng], { icon: driverIcon })
              .addTo(map)
              .bindPopup(`<b>Entregador (Tempo Real): ${escapeHtml(trackingDelivery.driver_name)}</b>`);
          }
        } else {
          if (trackingMarkersRef.current.driver) {
            map.removeLayer(trackingMarkersRef.current.driver);
            trackingMarkersRef.current.driver = null;
          }
        }
        
        if (trackingMarkersRef.current.client) {
          trackingMarkersRef.current.client.setLatLng([trackingDelivery.client_lat, trackingDelivery.client_lng]);
        }

        // Adjust line route representation from driver to client using street coordinates
        if (trackingRouteLineRef.current) {
          trackingRouteLineRef.current.setLatLngs(routeCoords);
        }
      }
    };

    // We wrap setupMap in a short timeout to make sure Leaflet maps containers are fully mounted in React modal and have computed layout widths/heights
    const timer = setTimeout(() => {
      if (active) setupMap();
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trackingDelivery?.id, trackingDelivery?.driver_id, trackingDelivery?.driver_lat, trackingDelivery?.driver_lng]);

  // Form Predefined coordinates picker helper
  const handlePredefinedLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // Kept for signature compatibility if needed
  };

  const generateDeliverySlots = () => {
    const days = [];
    const timesByDay: Record<string, string[]> = {};
    const WORK_START = 9;
    const WORK_END = 18;
    const MIN_HOURS_AHEAD = 2;
    const d = new Date();
    for (let i = 0; i < 5; i++) {
      const loopDate = new Date(d);
      loopDate.setDate(loopDate.getDate() + i);
      const dateStr = `${loopDate.getFullYear()}-${String(loopDate.getMonth() + 1).padStart(2, '0')}-${String(loopDate.getDate()).padStart(2, '0')}`; // data local (toISOString usa UTC e erra à noite)
      let label = '';
      if (i === 0) label = 'Hoje';
      else if (i === 1) label = 'Amanhã';
      else {
        const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const w = weekdays[loopDate.getDay()];
        const day = loopDate.getDate().toString().padStart(2, '0');
        const month = (loopDate.getMonth() + 1).toString().padStart(2, '0');
        label = `${w}, ${day}/${month}`;
      }
      let startHour = WORK_START;
      let startMinute = 0;
      if (i === 0) {
        const todayPlus2 = new Date();
        todayPlus2.setHours(todayPlus2.getHours() + MIN_HOURS_AHEAD);
        const remainder = todayPlus2.getMinutes() % 5;
        if (remainder !== 0) todayPlus2.setMinutes(todayPlus2.getMinutes() + (5 - remainder));
        if (todayPlus2.getHours() >= WORK_END && (todayPlus2.getHours() > WORK_END || todayPlus2.getMinutes() > 0)) continue;
        if (todayPlus2.getHours() > WORK_START || (todayPlus2.getHours() === WORK_START && todayPlus2.getMinutes() > 0)) {
          startHour = todayPlus2.getHours();
          startMinute = todayPlus2.getMinutes();
        }
      }
      days.push({ value: dateStr, label });
      const times = [];
      const t = new Date(loopDate);
      t.setHours(startHour, startMinute, 0, 0);
      const endT = new Date(loopDate);
      endT.setHours(WORK_END, 0, 0, 0);
      while (t <= endT) {
        const hStr = t.getHours().toString().padStart(2, '0');
        const mStr = t.getMinutes().toString().padStart(2, '0');
        times.push(`${hStr}:${mStr}`);
        t.setMinutes(t.getMinutes() + 5);
      }
      timesByDay[dateStr] = times;
    }
    return { days, timesByDay };
  };

  useEffect(() => {
    const slots = generateDeliverySlots();
    setDeliverySlots(slots);
    
    // Load products
    const fetchProducts = async () => {
      try {
        const { data } = await mockSupabaseDb.getProducts();
        setProducts(data || []);
      } catch (err) {
        console.error('Error loading products for delivery:', err);
      }
    };
    fetchProducts();
  }, []);

  // Endereços já usados pelo cliente escolhido: o operador só clica, sem digitar de novo
  const [mapJump, setMapJump] = useState<{ nonce: number; address: MapAddress } | null>(null);
  const pastAddresses = pastAddressesOf(deliveries, formClientId);

  const usePastAddress = (a: PastAddress) => {
    setAddressStreet(a.street);
    setAddressNumber(a.number);
    setAddressNeighborhood(a.neighborhood);
    setAddressReference(a.reference);
    setAddressLat(a.lat);
    setAddressLng(a.lng);
    setMapJump(prev => ({
      nonce: (prev?.nonce || 0) + 1,
      address: { street: a.street, number: a.number, neighborhood: a.neighborhood, city: 'Rio de Janeiro', zipCode: '', complement: a.reference, lat: a.lat, lng: a.lng },
    }));
  };

  const handleMapAddressSelect = (addr: MapAddress) => {
    setAddressStreet(addr.street);
    setAddressNumber(addr.number || '');
    setAddressNeighborhood(addr.neighborhood);
    setAddressReference(addr.complement || '');
    setAddressLat(addr.lat);
    setAddressLng(addr.lng);
  };

  const { items: filteredSearch, total: searchTotal } = searchProducts(products, productSearchQuery);

  // Produto vendido por peso: pergunta quanto vai levar antes de entrar na lista de itens.
  const [qtyDialog, setQtyDialog] = useState<{ product: Product; mode: 'add' | 'edit' } | null>(null);

  const confirmQuantity = (qty: number) => {
    if (!qtyDialog) return;
    const { product, mode } = qtyDialog;
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (mode === 'edit' && existing) return prev.map(item => (item.product.id === product.id ? { ...item, quantity: qty } : item));
      if (existing) return prev.map(item => (item.product.id === product.id ? { ...item, quantity: roundQty(item.quantity + qty) } : item));
      return [...prev, { product, quantity: qty }];
    });
    setQtyDialog(null);
  };

  const addToCart = (product: Product) => {
    if (isFractional(product.unit)) {
      setQtyDialog({ product, mode: 'add' });
      setProductSearchQuery('');
      setIsProductSearching(false);
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setProductSearchQuery('');
    setIsProductSearching(false);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const nextQty = item.quantity + delta;
        return nextQty > 0 ? { ...item, quantity: nextQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleBarcodeSubmit = (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    const sku = skuInput.trim();
    if (!sku) return;
    const foundProduct = products.find(p => p.sku === sku);
    if (foundProduct) {
      addToCart(foundProduct);
      setSkuInput('');
    } else {
      alert('Produto não encontrado!');
      setSkuInput('');
    }
  };

  // Distance calculation helper (Haversine formula in meters)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    const d = R * c; // in metres
    return d;
  };

  // Actions
  const handleDispatch = async (deliveryId: string, driverId: string) => {
    if (!driverId) return;
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;

    const scheduledTime = 'Hoje às ' + new Date(Date.now() + 30 * 60 * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (false && supabase) {
      try {
        const { error } = await supabase
          .from('deliveries')
          .update({
            driver_id: driverId,
            driver_name: driver.name,
            scheduled_time: scheduledTime
          })
          .eq('id', deliveryId);
        
        if (error) {
          alert('Erro ao despachar entrega no Supabase: ' + error.message);
          return;
        }

        const { data, error: fetchError } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
        if (fetchError) {
          alert('Erro ao atualizar dados do Supabase: ' + fetchError.message);
          return;
        }
        if (data) {
          setDeliveries(data);
          if (selectedDelivery?.id === deliveryId) {
            setSelectedDelivery(data.find(d => d.id === deliveryId) || null);
          }
        }
        await logAction(currentUser?.email || '', currentUser?.name || 'Gerente', 'Despacho de Entrega', `Entrega ID: ${deliveryId} despachada.`);
        return;
      } catch (err: any) {
        console.error('Error dispatching to Supabase:', err);
        alert('Erro inesperado: ' + err.message);
        return;
      }
    }

    const updated = deliveries.map(d => {
      if (d.id === deliveryId) {
        return {
          ...d,
          driver_id: driverId,
          driver_name: driver.name,
          scheduled_time: scheduledTime
        };
      }
      return d;
    });

    void persistDeliveries(deliveries, updated);
    setDeliveries(updated);
    void notifyDriver(driverId); // aviso com som no celular do entregador

    if (selectedDelivery?.id === deliveryId) {
      const refreshed = updated.find(d => d.id === deliveryId) || null;
      setSelectedDelivery(refreshed);
    }

    await logAction(
      currentUser?.email || '',
      currentUser?.name || 'Gerente',
      'Despacho de Entrega',
      `Entrega ID: ${deliveryId} despachada para o entregador "${driver.name}".`
    );
  };

  const handleCreateDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const fullAddress = `${addressStreet.trim()}, ${addressNumber.trim()} - ${addressNeighborhood.trim()}`;
    let scheduledTime = 'O mais breve possível';
    if (!deliveryAsap && deliveryDate && deliveryTime) {
      const selectedDayLabel = deliverySlots.days.find(d => d.value === deliveryDate)?.label || deliveryDate;
      scheduledTime = `${selectedDayLabel} às ${deliveryTime}`;
    }

    const generatedItemsStr = cart.map(item => describeItem(item.quantity, item.product.unit, item.product.name)).join(' + ');

    // Diz exatamente o que falta, em vez de uma mensagem genérica.
    const missing: string[] = [];
    if (!formClientId) missing.push('o Cliente');
    if (!formDriverId) missing.push('o Entregador Responsável');
    if (cart.length === 0) missing.push('pelo menos um produto');
    if (!addressStreet.trim()) missing.push('a Rua/Avenida');
    if (!addressNumber.trim()) missing.push('o Número do endereço (se o local não tiver número, digite S/N)');
    if (!addressNeighborhood.trim()) missing.push('o Bairro');

    // Pagamento: já pago, ou a receber na porta (forma de pagamento e, se for dinheiro, o troco)
    const cartTotal = cart.reduce((sum, item) => sum + lineTotal(item.product.price, item.quantity), 0);
    const payment: DeliveryPayment = paymentStatus === 'Já Pago'
      ? { status: 'pago' }
      : {
          status: 'receber',
          method: payMethod || undefined,
          amount: Number(cartTotal.toFixed(2)),
          ...(payMethod === 'dinheiro' ? { needs_change: needsChange, ...(needsChange ? { change_for: parseMoney(changeFor) } : {}) } : {}),
        };
    const paymentProblem = validatePayment(payment);
    if (paymentProblem && cart.length > 0) missing.push(paymentProblem);
    if (missing.length > 0) {
      alert(`Ainda falta preencher:\n\n• ${missing.join('\n• ')}`);
      return;
    }

    let itemsWithObsAndPayment = generatedItemsStr;
    if (deliveryObs.trim()) {
      itemsWithObsAndPayment += `\n[OBS: ${deliveryObs.trim()}]`;
    }
    itemsWithObsAndPayment += `\n[PGTO: ${paymentText(payment)}]`;

    const client = clients.find(c => c.id === formClientId);
    const driver = drivers.find(d => d.id === formDriverId);

    const newDelivery: DeliveryItem = {
      id: 'deliv-' + Math.random().toString(36).substring(2, 9),
      client_id: formClientId,
      client_name: client?.name || 'Cliente',
      client_address: fullAddress,
      client_lat: addressLat,
      client_lng: addressLng,
      driver_id: formDriverId,
      driver_name: driver?.name || 'Entregador',
      driver_lat: PETSHOP_COORDS.lat,
      driver_lng: PETSHOP_COORDS.lng,
      status: 'agendada',
      items: itemsWithObsAndPayment,
      scheduled_time: scheduledTime,
      payment,
      scheduled_at: !deliveryAsap && deliveryDate && deliveryTime ? new Date(`${deliveryDate}T${deliveryTime}:00`).toISOString() : null,
      address_parts: { street: addressStreet.trim(), number: addressNumber.trim(), neighborhood: addressNeighborhood.trim(), reference: addressReference.trim() },
      created_at: new Date().toISOString()
    };

    if (false && supabase) {
      try {
        const { error } = await supabase.from('deliveries').insert(newDelivery);
        if (error) {
          alert('Erro ao criar entrega no Supabase: ' + error.message);
          return;
        }

        const { data, error: fetchError } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
        if (fetchError) {
          alert('Erro ao carregar entregas do Supabase: ' + fetchError.message);
          return;
        }
        if (data) setDeliveries(data);
        setIsFormOpen(false);
        setFormClientId('');
        setFormDriverId('');
        setAddressStreet('');
        setAddressNumber('');
        setAddressNeighborhood('');
        setAddressReference('');
        setFormItems('');
        setCart([]);
        setSkuInput('');
        setDeliveryAsap(true);
        setDeliveryDate('');
        setDeliveryTime('');
        setDeliveryObs('');
        resetPaymentForm();
        setAddressLat(PETSHOP_COORDS.lat);
        setAddressLng(PETSHOP_COORDS.lng);
        await logAction(currentUser?.email || '', currentUser?.name || 'Gerente', 'Agendamento de Entrega', `Nova entrega criada.`);
        return;
      } catch (err: any) {
        console.error('Error creating delivery on Supabase:', err);
        alert('Erro inesperado: ' + err.message);
        return;
      }
    }

    const updated = [newDelivery, ...deliveries];
    void persistDeliveries(deliveries, updated);
    void notifyDriver(newDelivery.driver_id); // aviso com som no celular do entregador
    setDeliveries(updated);
    setIsFormOpen(false);

    // Clear form
    setFormClientId('');
    setFormDriverId('');
    setAddressStreet('');
    setAddressNumber('');
    setAddressNeighborhood('');
    setAddressReference('');
    setFormItems('');
    setCart([]);
    setSkuInput('');
    setDeliveryAsap(true);
    setDeliveryDate('');
    setDeliveryTime('');
    setDeliveryObs('');
    resetPaymentForm();
    setAddressLat(PETSHOP_COORDS.lat);
    setAddressLng(PETSHOP_COORDS.lng);

    await logAction(
      currentUser?.email || '',
      currentUser?.name || 'Gerente',
      'Agendamento de Entrega',
      `Nova entrega agendada para o cliente "${newDelivery.client_name}" com o entregador "${newDelivery.driver_name}".`
    );
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientFullName.trim() || !newClientEmail.trim() || !newClientUsername.trim() || !newClientPassword) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }

    setIsSavingClient(true);
    try {
      if (false && supabase) {
        const { createClient } = await import('@supabase/supabase-js');
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
        const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        const { data, error: signUpError } = await tempClient.auth.signUp({
          email: newClientEmail.trim(),
          password: newClientPassword,
          options: {
            data: {
              full_name: newClientFullName.trim(),
              username: newClientUsername.trim(),
              phone: newClientPhone.trim(),
            },
          },
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ role: 'client' })
            .eq('id', data.user.id);
          if (updateError) console.error('Erro ao atualizar cargo:', updateError);

          const newClient = { id: data.user.id, name: newClientFullName.trim() };
          setClients(prev => [...prev, newClient]);
          setFormClientId(newClient.id);
        }
      } else {
        if (!isFirebaseConfigured || !db || !secondaryAuth) throw new Error('Firebase não configurado.');
        const email = newClientEmail.trim();
        const username = newClientUsername.trim();
        const phone = newClientPhone.trim();

        if (await checkEmailExists(email)) throw new Error('Este e-mail já está cadastrado.');
        if (await checkUsernameExists(username)) throw new Error('Este login (username) já está em uso. Tente outro.');
        if (phone && await checkPhoneExists(phone)) throw new Error('Este celular já está cadastrado em outro usuário.');

        let cred;
        try {
          cred = await createUserWithEmailAndPassword(secondaryAuth, email, newClientPassword);
        } catch (createErr: any) {
          if (createErr?.code !== 'auth/email-already-in-use') throw createErr;
          // O login já existe, mas não há cadastro de cliente (sobra de testes antigos). Se a senha digitada for a dele,
          // reaproveitamos o login e criamos só o cadastro que faltava.
          try {
            cred = await signInWithEmailAndPassword(secondaryAuth, email, newClientPassword);
          } catch {
            throw new Error(
              'Este e-mail já tem um login no sistema, mas sem cadastro de cliente (sobra de testes antigos). ' +
              'Digite a senha que ele já usa, ou use outro e-mail.'
            );
          }
        }
        await updateProfile(cred.user, { displayName: newClientFullName.trim() });
        await setDoc(doc(db, 'profiles', cred.user.uid), {
          id: cred.user.uid,
          email: cred.user.email,
          full_name: newClientFullName.trim(),
          username,
          phone,
          role: 'client',
          is_active: true,
          // A senha foi definida pela equipe, não pelo cliente: no primeiro login ele é obrigado a trocá-la.
          must_change_password: true,
          created_at: new Date().toISOString(),
          collaborator_category_id: null,
        });
        // A sessão secundária serviu só para criar a conta; não deve ficar aberta.
        await signOut(secondaryAuth).catch(() => {});

        const newClient = { id: cred.user.uid, name: newClientFullName.trim() };
        setClients(prev => [...prev, newClient]);
        setFormClientId(newClient.id);
      }

      await logAction(
        currentUser?.email || '',
        currentUser?.name || 'Gerente',
        'Criação de Cliente',
        `Um novo cliente "${newClientFullName}" foi criado via módulo de Delivery.`
      );

      setIsClientModalOpen(false);
      setNewClientFullName('');
      setNewClientEmail('');
      setNewClientUsername('');
      setNewClientPhone('');
      setNewClientPassword(generateTempPassword());
      setShowClientPassword(false);
      alert('Cliente criado com sucesso!');
    } catch (err: any) {
      const friendly: Record<string, string> = {
        'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
        'auth/invalid-email': 'O e-mail informado não é válido.',
        'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
        'auth/network-request-failed': 'Sem conexão com a internet. Tente de novo.',
      };
      alert(friendly[err?.code] || err?.message || 'Erro ao criar cliente.');
    } finally {
      setIsSavingClient(false);
    }
  };

  const handleDeleteDelivery = async (id: string) => {
    if (!confirm('Deseja realmente remover esta entrega do sistema?')) return;

    if (false && supabase) {
      try {
        const { error } = await supabase.from('deliveries').delete().eq('id', id);
        if (error) {
          alert('Erro ao remover entrega no Supabase: ' + error.message);
          return;
        }

        const { data, error: fetchError } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
        if (fetchError) {
          alert('Erro ao atualizar lista do Supabase: ' + fetchError.message);
          return;
        }
        if (data) setDeliveries(data);
        if (selectedDelivery?.id === id) setSelectedDelivery(null);
        await logAction(currentUser?.email || '', currentUser?.name || 'Gerente', 'Exclusão de Entrega', `Entrega ID: ${id} excluída do painel.`);
        return;
      } catch (err: any) {
        console.error('Error deleting delivery on Supabase:', err);
        alert('Erro inesperado: ' + err.message);
        return;
      }
    }

    const updated = deliveries.filter(d => d.id !== id);
    void persistDeliveries(deliveries, updated);
    setDeliveries(updated);
    if (selectedDelivery?.id === id) {
      setSelectedDelivery(null);
    }
    await logAction(
      currentUser?.email || '',
      currentUser?.name || 'Gerente',
      'Exclusão de Entrega',
      `Entrega ID: ${id} excluída do painel.`
    );
  };

  const handleStartDelivery = async (delivery: DeliveryItem) => {
    if (false && supabase) {
      try {
        const { error } = await supabase
          .from('deliveries')
          .update({
            status: 'a-caminho',
            driver_lat: PETSHOP_COORDS.lat,
            driver_lng: PETSHOP_COORDS.lng
          })
          .eq('id', delivery.id);

        if (error) {
          alert('Erro ao iniciar entrega no Supabase: ' + error.message);
          return;
        }

        const { data, error: fetchError } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
        if (fetchError) {
          alert('Erro ao atualizar dados do Supabase: ' + fetchError.message);
          return;
        }
        if (data) {
          setDeliveries(data);
          setSelectedDelivery(data.find(d => d.id === delivery.id) || null);
        }
        await logAction(currentUser?.email || '', currentUser?.name || 'Entregador', 'Entrega Iniciada', `Entrega do cliente "${delivery.client_name}" foi iniciada e está a caminho.`);
        return;
      } catch (err: any) {
        console.error('Error starting delivery on Supabase:', err);
        alert('Erro inesperado: ' + err.message);
        return;
      }
    }

    const updated = deliveries.map(d => {
      if (d.id === delivery.id) {
        return {
          ...d,
          status: 'a-caminho' as const,
          driver_lat: PETSHOP_COORDS.lat, // Starts from shop coordinates
          driver_lng: PETSHOP_COORDS.lng
        };
      }
      return d;
    });

    void persistDeliveries(deliveries, updated);
    setDeliveries(updated);
    
    const refreshed = updated.find(d => d.id === delivery.id) || null;
    setSelectedDelivery(refreshed);

    await logAction(
      currentUser?.email || '',
      currentUser?.name || 'Entregador',
      'Entrega Iniciada',
      `Entrega do cliente "${delivery.client_name}" foi iniciada e está a caminho.`
    );
  };

  const handleFinishDelivery = async (delivery: DeliveryItem) => {
    if (false && supabase) {
      try {
        const { error } = await supabase
          .from('deliveries')
          .update({
            status: 'concluida',
            driver_lat: delivery.client_lat,
            driver_lng: delivery.client_lng
          })
          .eq('id', delivery.id);

        if (error) {
          alert('Erro ao finalizar entrega no Supabase: ' + error.message);
          return;
        }

        const { data, error: fetchError } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
        if (fetchError) {
          alert('Erro ao atualizar dados do Supabase: ' + fetchError.message);
          return;
        }
        if (data) {
          setDeliveries(data);
          setSelectedDelivery(data.find(d => d.id === delivery.id) || null);
        }
        await logAction(currentUser?.email || '', currentUser?.name || 'Entregador', 'Entrega Concluída', `Entrega para o cliente "${delivery.client_name}" finalizada com sucesso.`);
        return;
      } catch (err: any) {
        console.error('Error finishing delivery on Supabase:', err);
        alert('Erro inesperado: ' + err.message);
        return;
      }
    }

    const updated = deliveries.map(d => {
      if (d.id === delivery.id) {
        return {
          ...d,
          status: 'concluida' as const,
          driver_lat: d.client_lat,
          driver_lng: d.client_lng
        };
      }
      return d;
    });

    void persistDeliveries(deliveries, updated);
    setDeliveries(updated);
    
    const refreshed = updated.find(d => d.id === delivery.id) || null;
    setSelectedDelivery(refreshed);

    await logAction(
      currentUser?.email || '',
      currentUser?.name || 'Entregador',
      'Entrega Concluída',
      `Entrega para o cliente "${delivery.client_name}" finalizada com sucesso.`
    );
  };

  const handleConfirmReturnToBase = async (delivery: DeliveryItem) => {
    if (false && supabase) {
      try {
        const { error } = await supabase
          .from('deliveries')
          .update({
            driver_returned: true
          })
          .eq('id', delivery.id);

        if (error) {
          alert('Erro ao confirmar retorno no Supabase: ' + error.message);
          return;
        }

        const { data, error: fetchError } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
        if (fetchError) {
          alert('Erro ao atualizar dados do Supabase: ' + fetchError.message);
          return;
        }
        if (data) {
          setDeliveries(data);
          if (selectedDelivery?.id === delivery.id) {
            setSelectedDelivery(null);
          }
        }
        await logAction(currentUser?.email || '', currentUser?.name || 'Entregador', 'Retorno Confirmado', `O entregador confirmou o retorno à base para a entrega cancelada ID: ${delivery.id}.`);
        return;
      } catch (err: any) {
        console.error('Error confirming return on Supabase:', err);
        alert('Erro inesperado: ' + err.message);
        return;
      }
    }

    const updated = deliveries.map(d => {
      if (d.id === delivery.id) {
        return {
          ...d,
          driver_returned: true
        };
      }
      return d;
    });

    void persistDeliveries(deliveries, updated);
    setDeliveries(updated);
    
    if (selectedDelivery?.id === delivery.id) {
      setSelectedDelivery(null);
    }

    await logAction(
      currentUser?.email || '',
      currentUser?.name || 'Entregador',
      'Retorno Confirmado',
      `O entregador confirmou o retorno à base para a entrega cancelada ID: ${delivery.id}.`
    );
  };

  // Entregador: inicia na hora se já estiver liberado; senão, pede autorização ao gerente.
  const handleDriverStart = async (delivery: DeliveryItem) => {
    const gate = getStartGate(delivery);
    if (gate.allowed) {
      handleStartDeliveryAndNavigate(delivery);
      return;
    }
    if (delivery.start_request?.status === 'pendente') {
      alert('O pedido de autorização já foi enviado. Aguarde a resposta do gerente.');
      return;
    }
    const when = gate.opensAt ? fmtWhen(gate.opensAt) : '';
    const ok = confirm(
      `Esta entrega só é liberada ${EARLY_START_MINUTES} minutos antes do horário marcado (a partir de ${when}). ` +
      'Quer enviar um pedido de autorização ao gerente para iniciar agora?'
    );
    if (!ok) return;

    const request: StartRequest = {
      status: 'pendente',
      requested_at: new Date().toISOString(),
      requested_by_name: currentUser?.name || 'Entregador',
    };
    const updated = deliveries.map(d => (d.id === delivery.id ? { ...d, start_request: request } : d));
    void persistDeliveries(deliveries, updated);
    setDeliveries(updated);

    await logAction(
      currentUser?.email || '',
      currentUser?.name || 'Entregador',
      'Pedido de Autorização de Entrega',
      `O entregador pediu autorização para iniciar antes da hora a entrega ID: ${delivery.id} (${delivery.client_name}), marcada para ${delivery.scheduled_time}.`
    );
  };

  // Gerente: autoriza ou recusa o pedido do entregador.
  const handleDecideEarlyStart = async (delivery: DeliveryItem, approve: boolean) => {
    if (!delivery.start_request) return;
    const decision: StartRequest = {
      ...delivery.start_request,
      status: approve ? 'aprovada' : 'recusada',
      decided_at: new Date().toISOString(),
      decided_by_name: currentUser?.name || 'Gerente',
    };
    const updated = deliveries.map(d => (d.id === delivery.id ? { ...d, start_request: decision } : d));
    void persistDeliveries(deliveries, updated);
    setDeliveries(updated);

    await logAction(
      currentUser?.email || '',
      currentUser?.name || 'Gerente',
      approve ? 'Início Antecipado Autorizado' : 'Início Antecipado Recusado',
      `Pedido do entregador "${delivery.driver_name}" para iniciar antes da hora a entrega ID: ${delivery.id} (${delivery.client_name}) foi ${approve ? 'autorizado' : 'recusado'}.`
    );
  };

  const handleStartDeliveryAndNavigate = (delivery: DeliveryItem) => {
    handleStartDelivery(delivery);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${delivery.client_lat},${delivery.client_lng}`, '_blank');
  };

  const handleRequestSupport = async (delivery: DeliveryItem, reason: string) => {
    if (false && supabase) {
      try {
        const { error } = await supabase
          .from('deliveries')
          .update({ support_reason: reason })
          .eq('id', delivery.id);

        if (error) {
          alert('Erro ao solicitar suporte no Supabase: ' + error.message);
          return;
        }

        const { data, error: fetchError } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
        if (fetchError) {
          alert('Erro ao atualizar dados do Supabase: ' + fetchError.message);
          return;
        }
        if (data) setDeliveries(data);
      } catch (err: any) {
        console.error('Error requesting support on Supabase:', err);
        alert('Erro inesperado: ' + err.message);
        return;
      }
    } else {
      const updated = deliveries.map(d => {
        if (d.id === delivery.id) {
          return { ...d, support_reason: reason };
        }
        return d;
      });
      void persistDeliveries(deliveries, updated);
      setDeliveries(updated);
    }

    await logAction(
      currentUser?.email || '',
      currentUser?.name || 'Entregador',
      'Solicitação de Suporte',
      `O entregador "${currentUser?.name}" solicitou suporte para a entrega ID: ${delivery.id}. Motivo: "${reason}".`
    );

    setSupportModalDelivery(null);
    alert('Suporte solicitado com sucesso! A equipe entrará em contato.');
  };

  const handleResolveSupport = async (deliveryId: string) => {
    if (!confirm('Deseja marcar este suporte como resolvido? A sinalização de alerta e instruções serão limpas.')) return;

    if (false && supabase) {
      try {
        const { error } = await supabase
          .from('deliveries')
          .update({ support_reason: null, support_decision: null })
          .eq('id', deliveryId);

        if (error) {
          alert('Erro ao resolver suporte no Supabase: ' + error.message);
          return;
        }

        const { data, error: fetchError } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
        if (fetchError) {
          alert('Erro ao atualizar dados do Supabase: ' + fetchError.message);
          return;
        }
        if (data) setDeliveries(data);
      } catch (err: any) {
        console.error('Error resolving support on Supabase:', err);
        alert('Erro inesperado: ' + err.message);
        return;
      }
    } else {
      const updated = deliveries.map(d => {
        if (d.id === deliveryId) {
          return { ...d, support_reason: null, support_decision: null };
        }
        return d;
      });
      void persistDeliveries(deliveries, updated);
      setDeliveries(updated);
    }

    await logAction(
      currentUser?.email || '',
      currentUser?.name || 'Gerente',
      'Suporte Resolvido',
      `Suporte para a entrega ID: ${deliveryId} marcado como resolvido.`
    );
    alert('Suporte resolvido com sucesso!');
  };

  const handleSaveSupportDecision = async (deliveryId: string, decision: string, isCancellation: boolean) => {
    const updateData: any = {
      support_decision: decision
    };
    if (isCancellation) {
      updateData.status = 'cancelada';
    }

    if (false && supabase) {
      try {
        const { error } = await supabase
          .from('deliveries')
          .update(updateData)
          .eq('id', deliveryId);

        if (error) {
          alert('Erro ao salvar decisão de suporte no Supabase: ' + error.message);
          return;
        }

        const { data, error: fetchError } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
        if (fetchError) {
          alert('Erro ao atualizar dados do Supabase: ' + fetchError.message);
          return;
        }
        if (data) setDeliveries(data);
      } catch (err: any) {
        console.error('Error saving support decision on Supabase:', err);
        alert('Erro inesperado: ' + err.message);
        return;
      }
    } else {
      const updated = deliveries.map(d => {
        if (d.id === deliveryId) {
          return {
            ...d,
            ...updateData
          };
        }
        return d;
      });
      void persistDeliveries(deliveries, updated);
      setDeliveries(updated);
    }

    await logAction(
      currentUser?.email || '',
      currentUser?.name || 'Gerente',
      'Decisão de Suporte',
      `Decisão tomada para a entrega ID: ${deliveryId}. Instrução: "${decision}".`
    );

    setManagerSupportModalDelivery(null);
    setSelectedDecisionOption('');
    setCustomDecisionText('');
    alert('Decisão de suporte registrada e enviada ao entregador com sucesso!');
  };

  // Filter deliveries list for management view
  const getFilteredDeliveries = () => {
    return deliveries.filter(d => {
      if (filterStatus !== 'all' && d.status !== filterStatus) return false;
      if (filterDriver !== 'all' && d.driver_id !== filterDriver) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          d.client_name.toLowerCase().includes(query) ||
          d.client_address.toLowerCase().includes(query) ||
          d.items.toLowerCase().includes(query)
        );
      }
      return true;
    });
  };

  // Get status color tokens
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'agendada':
        return { label: 'Agendada', bg: 'rgba(54, 162, 235, 0.08)', text: 'hsl(210, 85%, 45%)', border: 'rgba(54, 162, 235, 0.2)' };
      case 'a-caminho':
        return { label: 'A Caminho', bg: 'rgba(255, 206, 86, 0.08)', text: 'hsl(36, 95%, 45%)', border: 'rgba(255, 206, 86, 0.2)' };
      case 'concluida':
        return { label: 'Concluída', bg: 'rgba(75, 192, 192, 0.08)', text: 'hsl(142, 60%, 40%)', border: 'rgba(75, 192, 192, 0.2)' };
      case 'cancelada':
        return { label: 'Cancelada', bg: 'rgba(239, 68, 68, 0.08)', text: 'hsl(0, 75%, 50%)', border: 'rgba(239, 68, 68, 0.2)' };
      default:
        return { label: status, bg: 'rgba(0,0,0,0.05)', text: '#333', border: '#ddd' };
    }
  };

  // Count helper
  const counts = {
    agendadas: deliveries.filter(d => d.status === 'agendada').length,
    acaminho: deliveries.filter(d => d.status === 'a-caminho').length,
    concluidas: deliveries.filter(d => d.status === 'concluida').length
  };

  // Current client context deliveries
  const clientDeliveries = deliveries.filter(d => d.client_id === currentUser?.id);
  const pendingStartRequests = deliveries.filter(d => d.status === 'agendada' && d.start_request?.status === 'pendente');
  const activeClientDelivery = clientDeliveries.find(
    d => d.status === 'a-caminho' || (d.status === 'cancelada' && !d.driver_returned)
  );

  // Current driver context deliveries (filter: only show active ongoing or canceled but not returned order if exists, otherwise show pending scheduled ones)
  let driverDeliveries = deliveries.filter(d => d.driver_id === currentUser?.id);
  const activeDriverDelivery = driverDeliveries.find(
    d => d.status === 'a-caminho' || (d.status === 'cancelada' && !d.driver_returned)
  );
  if (activeDriverDelivery) {
    driverDeliveries = [activeDriverDelivery];
  } else {
    driverDeliveries = driverDeliveries.filter(d => d.status === 'agendada');
  }

  return (
    <section style={styles.contentSection} aria-labelledby="delivery-heading">
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-icon {
          animation: spin 6s linear infinite;
        }
        .leaflet-container {
          width: 100%;
          height: 380px;
          border-radius: 12px;
          border: 1px solid ${styles.borderColor};
          box-shadow: ${styles.shadow};
          z-index: 1;
        }
        .progress-bar-container {
          width: 100%;
          background-color: ${styles.isDark ? '#222' : '#eee'};
          border-radius: 6px;
          height: 10px;
          overflow: hidden;
          margin: 10px 0;
        }
        .progress-bar-fill {
          height: 100%;
          background-color: hsl(36, 95%, 55%);
          transition: width 0.5s ease-out;
        }
        .delivery-grid-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        @media (min-width: 1200px) {
          .delivery-grid-container.has-map {
            display: grid;
            grid-template-columns: 1.2fr 1fr;
          }
          .delivery-grid-container.has-map.driver-view {
            grid-template-columns: 1fr 1.2fr;
          }
        }
      `}</style>

      {/* Header */}
      <div style={styles.crudHeader}>
        <div>
          <h2 id="delivery-heading" style={styles.sectionTitle}>
            <Truck size={22} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
            Módulo de Delivery
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            {isManager && 'Acompanhe as entregas da sua frota e agende novos pedidos.'}
            {isDriver && `Olá ${currentUser?.name}, veja abaixo suas entregas atribuídas.`}
            {isClient && 'Monitore a entrega de suas rações, brinquedos e medicamentos em tempo real.'}
          </p>
        </div>

        {isManager && (
          <button onClick={() => setIsFormOpen(true)} style={styles.btnAcc(false)}>
            <PlusCircle size={16} /> Agendar Nova Entrega
          </button>
        )}
      </div>

      {/* ======================================= */}
      {/* 1. VISÃO DE CLIENTE                     */}
      {/* ======================================= */}
      {isClient && (
        <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {activeClientDelivery ? (
            <div style={{
              padding: '20px', borderRadius: '12px', border: `2px solid ${styles.primary}`,
              backgroundColor: styles.cardBackground || '#fff', boxShadow: styles.shadowLg
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {activeClientDelivery.status === 'cancelada' ? (
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'hsl(0, 75%, 50%)', textTransform: 'uppercase'
                    }}>
                      Status: Entrega Cancelada
                    </span>
                  ) : (
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
                      backgroundColor: 'rgba(255, 206, 86, 0.15)', color: 'hsl(36, 95%, 45%)', textTransform: 'uppercase'
                    }}>
                      Status: Pedido a Caminho
                    </span>
                  )}
                  {isSupabaseConfigured && (
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
                      backgroundColor: 'rgba(56, 189, 248, 0.15)', color: 'hsl(199, 89%, 48%)', textTransform: 'uppercase'
                    }}>
                      📡 GPS Real
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>
                  Entregador: <strong>{activeClientDelivery.driver_name}</strong>
                </span>
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: styles.textMain, marginTop: '12px' }}>
                {activeClientDelivery.status === 'cancelada' ? 'Informação sobre sua Entrega' : 'Acompanhe seu Pedido'}
              </h3>
              <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '4px' }}>
                Itens: {activeClientDelivery.items}
              </p>

              {activeClientDelivery.status === 'cancelada' ? (
                <div style={{
                  marginTop: '10px', padding: '12px 14px', backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', fontSize: '0.85rem',
                  color: 'hsl(0, 75%, 45%)', fontWeight: 700, display: 'flex', flexDirection: 'column', gap: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={16} /> 
                    <span>ENTREGA CANCELADA - RETORNANDO À BASE</span>
                  </div>
                  <p style={{ fontWeight: 500, fontSize: '0.8rem', color: styles.sidebarWidgetText?.color || '#555', marginTop: '4px' }}>
                    Esta entrega foi cancelada pelo suporte. O entregador está retornando ao petshop com a mercadoria.
                    {activeClientDelivery.support_decision && (
                      <span> Motivo/Instrução: <strong>"{activeClientDelivery.support_decision}"</strong>.</span>
                    )}
                    Por favor, entre em contato com a loja para reagendar ou tirar dúvidas.
                  </p>
                </div>
              ) : activeClientDelivery.support_reason && (
                <div style={{
                  marginTop: '10px', padding: '10px 12px', backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '6px', fontSize: '0.82rem',
                  color: 'hsl(0, 75%, 45%)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <AlertCircle size={14} /> 
                  <span>
                    Dificuldade relatada pelo entregador: "{activeClientDelivery.support_reason}". 
                    {activeClientDelivery.support_decision ? (
                      <span> Instrução do suporte: <strong>"{activeClientDelivery.support_decision}"</strong>.</span>
                    ) : (
                      <span> Nosso suporte já está analisando para resolver.</span>
                    )}
                  </span>
                </div>
              )}

              {/* Progress and Distance details */}
              {(() => {
                const dist = calculateDistance(
                  activeClientDelivery.driver_lat, activeClientDelivery.driver_lng,
                  activeClientDelivery.client_lat, activeClientDelivery.client_lng
                );
                const totalDist = calculateDistance(
                  PETSHOP_COORDS.lat, PETSHOP_COORDS.lng,
                  activeClientDelivery.client_lat, activeClientDelivery.client_lng
                );
                
                const percentDone = totalDist > 0 ? Math.min(100, Math.max(0, ((totalDist - dist) / totalDist) * 100)) : 0;
                const distKm = (dist / 1000).toFixed(2);
                
                return (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
                      <span>Distância até você: {distKm} km</span>
                      <span>{percentDone >= 99 ? 'Entregador chegou!' : `${percentDone.toFixed(0)}% do caminho`}</span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar-fill" style={{ width: `${percentDone}%` }}></div>
                    </div>
                    {dist < 30 ? (
                      <div style={{
                        marginTop: '10px', padding: '10px', backgroundColor: 'rgba(75, 192, 192, 0.1)',
                        color: 'hsl(142, 60%, 35%)', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '8px'
                      }}>
                        <CheckCircle size={16} /> O entregador chegou à sua residência!
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color, fontStyle: 'italic' }}>
                        Tempo estimado de chegada: ~{Math.ceil(dist / 150)} min
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Map Holder */}
              <div style={{ marginTop: '20px' }}>
                <div ref={mapContainerRef} className="leaflet-container"></div>
              </div>

              <button 
                onClick={() => {
                  setSelectedDelivery(activeClientDelivery);
                }}
                style={{
                  ...styles.btnAcc(false), marginTop: '12px', width: '100%',
                  justifyContent: 'center', background: styles.primary, color: '#fff'
                }}
              >
                <Compass size={16} /> Centralizar e Atualizar Rota no Mapa
              </button>
            </div>
          ) : (
            <div style={{
              padding: '30px', textAlign: 'center', borderRadius: '12px',
              backgroundColor: styles.cardBackground || '#fff', border: `1px solid ${styles.borderColor}`
            }}>
              <Compass size={40} style={{ color: styles.sidebarWidgetText?.color, opacity: 0.5, marginBottom: '12px' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: styles.textMain }}>Nenhuma entrega ativa no momento</h3>
              <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '6px' }}>
                Quando você realizar uma compra em nosso petshop e o entregador iniciar o transporte, você poderá rastrear o trajeto em tempo real aqui!
              </p>
            </div>
          )}

          {/* Client Deliveries History */}
          <div style={{ marginTop: '10px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: styles.textMain, marginBottom: '12px' }}>
              Histórico de Pedidos de Delivery
            </h3>
            {clientDeliveries.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color }}>Você ainda não realizou pedidos com entrega.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {clientDeliveries.map(d => {
                  const badg = getStatusBadge(d.status);
                  return (
                    <div key={d.id} style={{
                      padding: '12px 16px', borderRadius: '10px', border: `1px solid ${styles.borderColor}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                      backgroundColor: styles.cardBackground
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: styles.textMain }}>{d.items}</div>
                        <div style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color, marginTop: '3px' }}>
                          Agendado para: {d.scheduled_time} | Destino: {d.client_address}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '12px',
                        backgroundColor: badg.bg, color: badg.text, border: `1px solid ${badg.border}`
                      }}>
                        {badg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* 2. VISÃO DE ENTREGADOR                  */}
      {/* ======================================= */}
      {isDriver && (
        <div className={`delivery-grid-container${selectedDelivery ? ' has-map driver-view' : ''}`} style={{ marginTop: '24px' }}>
          
          {/* Left: Deliveries list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: styles.textMain }}>Suas Entregas</h3>

            {currentUser?.id && <PushSetup styles={styles} uid={currentUser.id} name={currentUser.name || 'Entregador'} />}
            
            {isLocationApproximate && (
              <div style={{
                padding: '10px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                color: 'hsl(0, 75%, 50%)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                lineHeight: '1.4'
              }}>
                ⚠️ <strong>Aviso: Localização Aproximada Ativada.</strong> Por favor, altere para <strong>"Local Exato"</strong> em seu navegador/dispositivo para que o GPS envie sua posição correta em tempo real.
              </div>
            )}

            {driverDeliveries.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color }}>Não há entregas atribuídas a você.</p>
            ) : (
              driverDeliveries.map(d => {
                const badg = getStatusBadge(d.status);
                const isSelected = selectedDelivery?.id === d.id;
                
                return (
                  <div key={d.id} style={{
                    padding: '14px', borderRadius: '12px', border: isSelected ? `2px solid ${styles.primary}` : `1px solid ${styles.borderColor}`,
                    backgroundColor: styles.cardBackground || '#fff', boxShadow: styles.shadow,
                    display: 'flex', flexDirection: 'column', gap: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '12px',
                        backgroundColor: badg.bg, color: badg.text, border: `1px solid ${badg.border}`
                      }}>
                        {badg.label}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>{d.scheduled_time}</span>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: styles.textMain }}>
                      {d.client_name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
                      Endereço: {d.client_address}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
                      Itens: {d.payment ? stripPaymentTag(d.items) : d.items}
                    </div>
                    <DeliveryPaymentBox payment={d.payment} />

                    {d.support_reason && (
                      <div style={{
                        marginTop: '5px', padding: '6px 10px', borderRadius: '6px',
                        backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)',
                        fontSize: '0.78rem', color: 'hsl(0, 75%, 50%)', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '6px'
                      }}>
                        <AlertCircle size={12} /> Suporte solicitado: "{d.support_reason}"
                      </div>
                    )}

                    {d.support_decision && (
                      <div style={{
                        marginTop: '5px', padding: '10px 12px', borderRadius: '8px',
                        backgroundColor: d.status === 'cancelada' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.08)',
                        border: d.status === 'cancelada' ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(59, 130, 246, 0.2)',
                        fontSize: '0.82rem', color: d.status === 'cancelada' ? 'hsl(0, 75%, 45%)' : 'hsl(217, 91%, 35%)',
                        fontWeight: 700, display: 'flex', flexDirection: 'column', gap: '4px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: d.status === 'cancelada' ? 'hsl(0, 75%, 50%)' : 'hsl(217, 91%, 45%)' }}>
                          <LifeBuoy size={12} /> 
                          <span>INSTRUÇÃO DO SUPORTE:</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', fontStyle: 'italic', fontWeight: 600 }}>
                          "{d.support_decision}"
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', borderTop: `1px solid ${styles.borderColor}`, paddingTop: '10px', flexWrap: 'wrap' }}>
                      {d.status === 'agendada' && (() => {
                        const gate = getStartGate(d, nowTick);
                        const req = d.start_request;
                        const waiting = !gate.allowed && req?.status === 'pendente';
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                            <button
                              onClick={() => handleDriverStart(d)}
                              disabled={waiting}
                              style={{
                                ...styles.btnAcc(false), padding: '6px 12px', fontSize: '0.8rem',
                                backgroundColor: gate.allowed ? 'hsl(36, 95%, 50%)' : 'hsl(215, 15%, 55%)',
                                color: '#fff', border: 'none', opacity: waiting ? 0.7 : 1, cursor: waiting ? 'not-allowed' : 'pointer'
                              }}
                            >
                              <Play size={12} style={{ marginRight: '4px' }} />
                              {gate.allowed ? 'Iniciar Entrega' : waiting ? 'Aguardando autorização...' : 'Solicitar autorização para iniciar'}
                            </button>
                            {!gate.allowed && gate.opensAt && (
                              <span style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>
                                Libera para iniciar a partir de {fmtWhen(gate.opensAt)}.
                                {req?.status === 'recusada' && <strong style={{ color: 'hsl(0, 75%, 45%)' }}> Pedido recusado{req.decided_by_name ? ` por ${req.decided_by_name}` : ''}.</strong>}
                              </span>
                            )}
                            {gate.authorized && (
                              <span style={{ fontSize: '0.75rem', color: 'hsl(142, 60%, 32%)', fontWeight: 600 }}>
                                Início antecipado autorizado{req?.decided_by_name ? ` por ${req.decided_by_name}` : ''}.
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      
                      {d.status === 'a-caminho' && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleFinishDelivery(d)}
                            style={{
                              ...styles.btnAcc(false), padding: '6px 12px', fontSize: '0.8rem',
                              backgroundColor: 'hsl(142, 60%, 45%)', color: '#fff', border: 'none'
                            }}
                          >
                            <CheckCircle size={12} style={{ marginRight: '4px' }} /> Marcar como Entregue
                          </button>
                          <button
                            onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${d.client_lat},${d.client_lng}`, '_blank')}
                            style={{
                              ...styles.btnAcc(false), padding: '6px 12px', fontSize: '0.8rem',
                              backgroundColor: '#4285F4', color: '#fff', border: 'none'
                            }}
                          >
                            <Map size={12} style={{ marginRight: '4px' }} /> Iniciar Entrega
                          </button>
                          <button
                            onClick={() => setSupportModalDelivery(d)}
                            style={{
                              ...styles.btnAcc(false), padding: '6px 12px', fontSize: '0.8rem',
                              backgroundColor: 'hsl(0, 75%, 50%)', color: '#fff', border: 'none'
                            }}
                          >
                            <LifeBuoy size={12} style={{ marginRight: '4px' }} /> Solicitar Suporte
                          </button>
                        </div>
                      )}

                      {d.status === 'cancelada' && (
                        <button
                          onClick={() => handleConfirmReturnToBase(d)}
                          style={{
                            ...styles.btnAcc(false), padding: '6px 12px', fontSize: '0.8rem',
                            backgroundColor: 'hsl(0, 75%, 50%)', color: '#fff', border: 'none',
                            fontWeight: 'bold'
                          }}
                        >
                          <CheckCircle size={12} style={{ marginRight: '4px' }} /> Confirmar Retorno à Base
                        </button>
                      )}
                      
                      <button
                        onClick={() => setSelectedDelivery(isSelected ? null : d)}
                        style={{
                          ...styles.btnAcc(false), padding: '6px 12px', fontSize: '0.8rem',
                          marginLeft: 'auto'
                        }}
                      >
                        {isSelected ? <X size={12} /> : <Eye size={12} />} 
                        {isSelected ? ' Fechar Mapa' : ' Ver Mapa'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Map view */}
          {selectedDelivery && (
            <div style={{
              padding: '16px', borderRadius: '12px', border: `1px solid ${styles.borderColor}`,
              backgroundColor: styles.cardBackground, display: 'flex', flexDirection: 'column', gap: '14px',
              height: 'fit-content'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: styles.textMain }}>
                  Navegação / Mapa da Entrega
                </h3>
                <button onClick={() => setSelectedDelivery(null)} style={{ border: 'none', background: 'none', color: styles.textMain, cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              {selectedDelivery.status === 'a-caminho' && (
                <div style={{
                  padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(36, 95%, 55%, 0.08)',
                  border: '1px solid rgba(36, 95%, 55%, 0.25)', fontSize: '0.85rem'
                }}>
                  <div style={{ fontWeight: 600, color: styles.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Compass size={14} className="spin-icon" style={{ animation: 'spin 4s linear infinite' }} />
                    {isSupabaseConfigured ? '📡 Rastreamento GPS Real Ativo' : 'Simulação Ativa'}
                  </div>
                  {!isSupabaseConfigured && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>Acelerar Simulação:</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[1, 5, 10].map(s => (
                          <button
                            key={s}
                            onClick={() => setSimSpeed(s)}
                            style={{
                              padding: '3px 8px', borderRadius: '4px', border: `1px solid ${styles.borderColor}`,
                              fontSize: '0.75rem', cursor: 'pointer',
                              backgroundColor: simSpeed === s ? styles.primary : styles.background,
                              color: simSpeed === s ? '#fff' : styles.textMain
                            }}
                          >
                            {s}x
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Distância */}
              {(() => {
                const dist = calculateDistance(
                  selectedDelivery.driver_lat, selectedDelivery.driver_lng,
                  selectedDelivery.client_lat, selectedDelivery.client_lng
                );
                return (
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: styles.textMain }}>
                    Distância Restante: <span style={{ color: styles.primary }}>{(dist / 1000).toFixed(2)} km</span>
                    {dist < 15 && (
                      <span style={{ color: 'hsl(142, 60%, 40%)', marginLeft: '8px' }}>✓ Destino Atingido!</span>
                    )}
                  </div>
                );
              })()}

              <div ref={mapContainerRef} className="leaflet-container"></div>
            </div>
          )}
        </div>
      )}

      {/* ======================================= */}
      {/* 3. VISÃO DE GERENTE                     */}
      {/* ======================================= */}
      {isManager && (
        <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* KPI Dashboard cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ ...styles.petCard, padding: '16px', borderLeft: `4px solid hsl(210, 85%, 45%)` }}>
              <div style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>
                Entregas Agendadas
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: styles.textMain, marginTop: '5px' }}>
                {counts.agendadas}
              </div>
            </div>
            <div style={{ ...styles.petCard, padding: '16px', borderLeft: `4px solid hsl(36, 95%, 50%)` }}>
              <div style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>
                Em Trânsito (A Caminho)
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: styles.textMain, marginTop: '5px' }}>
                {counts.acaminho}
              </div>
            </div>
            <div style={{ ...styles.petCard, padding: '16px', borderLeft: `4px solid hsl(142, 60%, 40%)` }}>
              <div style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>
                Concluídas
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: styles.textMain, marginTop: '5px' }}>
                {counts.concluidas}
              </div>
            </div>
          </div>

          {/* Pedidos dos entregadores para iniciar antes da hora */}
          {pendingStartRequests.length > 0 && (
            <div role="alert" style={{
              padding: '14px 16px', borderRadius: '10px', border: '1px solid hsl(36, 95%, 45%, 0.4)',
              backgroundColor: 'hsl(36, 95%, 45%, 0.08)', display: 'flex', flexDirection: 'column', gap: '10px'
            }}>
              <strong style={{ color: 'hsl(36, 95%, 28%)', fontSize: '0.9rem' }}>
                🔔 {pendingStartRequests.length} pedido(s) de autorização para iniciar entrega antes da hora
              </strong>
              {pendingStartRequests.map(d => (
                <div key={d.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.83rem', color: styles.textMain }}>
                    <strong>{d.driver_name || d.start_request?.requested_by_name}</strong> quer iniciar a entrega de <strong>{d.client_name}</strong>
                    {' '}marcada para <strong>{d.scheduled_time}</strong>.
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleDecideEarlyStart(d, true)}
                      style={{ ...styles.btnAcc(false), padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'hsl(142, 60%, 40%)', color: '#fff', border: 'none' }}
                    >
                      Autorizar
                    </button>
                    <button
                      onClick={() => handleDecideEarlyStart(d, false)}
                      style={{ ...styles.btnAcc(false), padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'hsl(0, 75%, 50%)', color: '#fff', border: 'none' }}
                    >
                      Recusar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Filtering Toolbar */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px',
            backgroundColor: styles.background, borderRadius: '10px', border: `1px solid ${styles.borderColor}`,
            alignItems: 'center'
          }}>
            <div style={{ flex: '1 1 200px', position: 'relative' }}>
              <input
                type="text"
                placeholder="Buscar cliente ou endereço..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ ...styles.formInput, width: '100%', paddingLeft: '34px', fontSize: '0.85rem', padding: '8px 10px 8px 34px' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: styles.sidebarWidgetText?.color }} />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', flex: '0 1 150px' }}
            >
              <option value="all">Todos os Status</option>
              <option value="agendada">Agendadas</option>
              <option value="a-caminho">Em Trânsito</option>
              <option value="concluida">Concluídas</option>
            </select>

            <select
              value={filterDriver}
              onChange={(e) => setFilterDriver(e.target.value)}
              style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', flex: '0 1 180px' }}
            >
              <option value="all">Todos os Entregadores</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            {(filterStatus !== 'all' || filterDriver !== 'all' || searchQuery !== '') && (
              <button
                onClick={() => { setFilterStatus('all'); setFilterDriver('all'); setSearchQuery(''); }}
                style={{ background: 'none', border: 'none', color: styles.primary, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '3px' }}
              >
                <X size={14} /> Limpar
              </button>
            )}
          </div>

          {/* List and Map split */}
          <div className={`delivery-grid-container${selectedDelivery ? ' has-map' : ''}`} style={{ marginTop: '20px' }}>
            
            {/* Table layout of deliveries */}
            <div style={{
              padding: '16px', backgroundColor: styles.cardBackground,
              borderRadius: '12px', border: `1px solid ${styles.borderColor}`, boxShadow: styles.shadow,
              overflowX: 'auto'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${styles.borderColor}`, color: styles.sidebarWidgetText?.color }}>
                    <th style={{ padding: '10px 6px' }}>Cliente</th>
                    <th style={{ padding: '10px 6px' }}>Itens</th>
                    <th style={{ padding: '10px 6px' }}>Entregador</th>
                    <th style={{ padding: '10px 6px' }}>Agendamento</th>
                    <th style={{ padding: '10px 6px' }}>Status</th>
                    <th style={{ padding: '10px 6px', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {getFilteredDeliveries().length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: styles.sidebarWidgetText?.color }}>
                        Nenhuma entrega encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    getFilteredDeliveries().map(d => {
                      const badg = getStatusBadge(d.status);
                      const isSelected = selectedDelivery?.id === d.id;
                      
                      return (
                        <tr key={d.id} style={{
                          borderBottom: `1px solid ${styles.borderColor}`, color: styles.textMain,
                          backgroundColor: isSelected ? 'rgba(210, 85%, 45%, 0.04)' : 'transparent'
                        }}>
                          <td style={{ padding: '12px 6px', fontWeight: 600 }}>
                            {d.client_name}
                            <div style={{ fontSize: '0.75rem', fontWeight: 400, color: styles.sidebarWidgetText?.color, marginTop: '2px' }}>
                              {d.client_address}
                            </div>
                            {d.support_reason && (
                              <div 
                                onClick={() => {
                                  setManagerSupportModalDelivery(d);
                                  setSelectedDecisionOption('');
                                  setCustomDecisionText('');
                                }}
                                style={{
                                  marginTop: '4px', padding: '3px 6px', borderRadius: '4px',
                                  backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)',
                                  fontSize: '0.72rem', color: '#ef4444', fontWeight: 600,
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                  cursor: 'pointer'
                                }}
                                title="Clique para tomar uma decisão de suporte"
                              >
                                <AlertCircle size={10} /> Suporte: "{d.support_reason}"
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 6px' }}>
                            {d.payment ? stripPaymentTag(d.items) : d.items}
                            {d.payment && <div style={{ marginTop: '4px' }}><DeliveryPaymentBox payment={d.payment} compact /></div>}
                          </td>
                          <td style={{ padding: '12px 6px' }}>
                            {d.driver_id ? (
                              d.driver_name
                            ) : (
                              <select
                                value=""
                                onChange={(e) => handleDispatch(d.id, e.target.value)}
                                style={{
                                  ...styles.formInput,
                                  padding: '4px 6px',
                                  fontSize: '0.8rem',
                                  borderColor: styles.primary,
                                  backgroundColor: styles.cardBackground,
                                  cursor: 'pointer',
                                  maxWidth: '130px',
                                  textOverflow: 'ellipsis'
                                }}
                              >
                                <option value="">— Despachar —</option>
                                {drivers.map(drv => (
                                  <option key={drv.id} value={drv.id}>{drv.name}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td style={{ padding: '12px 6px', color: styles.sidebarWidgetText?.color }}>{d.scheduled_time}</td>
                          <td style={{ padding: '12px 6px' }}>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 700, padding: '3px 6px', borderRadius: '12px',
                              backgroundColor: badg.bg, color: badg.text, border: `1px solid ${badg.border}`
                            }}>
                              {badg.label}
                            </span>
                          </td>
                            <td style={{ padding: '12px 6px', display: 'flex', gap: '6px', justifyContent: 'center', height: '100%', alignItems: 'center', border: 'none' }}>
                            {d.support_reason && (
                              <button
                                onClick={() => {
                                  setManagerSupportModalDelivery(d);
                                  setSelectedDecisionOption('');
                                  setCustomDecisionText('');
                                }}
                                title="Tomar Decisão de Suporte / Resolver"
                                className="btn-action-icon"
                                style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
                              >
                                <LifeBuoy size={13} />
                              </button>
                            )}
                            <button
                              onClick={() => setTrackingDelivery(d)}
                              title="Rastrear em Tempo Real"
                              className="btn-action-icon"
                              style={{ backgroundColor: trackingDelivery?.id === d.id ? `${styles.primary}20` : 'transparent', color: trackingDelivery?.id === d.id ? styles.primary : styles.textMain }}
                            >
                              <Compass size={13} />
                            </button>
                            <button
                              onClick={() => setSelectedDelivery(isSelected ? null : d)}
                              title="Visualizar no Mapa"
                              className="btn-action-icon"
                              style={{ backgroundColor: isSelected ? `${styles.primary}20` : 'transparent', color: isSelected ? styles.primary : styles.textMain }}
                            >
                              <Map size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteDelivery(d.id)}
                              title="Remover Registro"
                              className="btn-action-icon btn-action-danger"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Float Map monitor */}
            {selectedDelivery && (
              <div style={{
                padding: '16px', borderRadius: '12px', border: `1px solid ${styles.borderColor}`,
                backgroundColor: styles.cardBackground, display: 'flex', flexDirection: 'column', gap: '14px',
                height: 'fit-content'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: styles.textMain }}>
                      Monitoramento: {selectedDelivery.client_name}
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color, marginTop: '2px' }}>
                      Status: {getStatusBadge(selectedDelivery.status).label}
                    </p>
                  </div>
                  <button onClick={() => setSelectedDelivery(null)} style={{ border: 'none', background: 'none', color: styles.textMain, cursor: 'pointer' }}>
                    <X size={18} />
                  </button>
                </div>

                {selectedDelivery.status === 'a-caminho' && (
                  <div style={{
                    padding: '8px 10px', borderRadius: '6px', backgroundColor: 'rgba(36, 95%, 55%, 0.08)',
                    fontSize: '0.78rem', border: '1px solid rgba(36, 95%, 55%, 0.15)'
                  }}>
                    <span style={{ fontWeight: 600 }}>
                      {isSupabaseConfigured ? '📡 Rastreamento GPS Real Ativo' : 'Entregador em deslocamento.'}
                    </span>
                    {!isSupabaseConfigured && (
                      <div style={{ marginTop: '5px', display: 'flex', gap: '4px' }}>
                        <span>Velocidade:</span>
                        {[1, 5, 10].map(s => (
                          <button key={s} onClick={() => setSimSpeed(s)} style={{ fontSize: '0.7rem', padding: '1px 5px', backgroundColor: simSpeed === s ? styles.primary : '#eee', color: simSpeed === s ? '#fff' : '#000', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                            {s}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(() => {
                  const dist = calculateDistance(
                    selectedDelivery.driver_lat, selectedDelivery.driver_lng,
                    selectedDelivery.client_lat, selectedDelivery.client_lng
                  );
                  return (
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: styles.textMain }}>
                      Distância do Entregador: <span style={{ color: styles.primary }}>{(dist / 1000).toFixed(2)} km</span>
                    </div>
                  );
                })()}

                <div ref={mapContainerRef} className="leaflet-container"></div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* ======================================= */}
      {/* 4. MODAL: AGENDAR NOVA ENTREGA          */}
      {/* ======================================= */}
      {isFormOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '900px' }} role="dialog" aria-modal="true" aria-labelledby="form-title">
            
            <div style={styles.modalHeader}>
              <h2 id="form-title" style={styles.modalTitle}>Agendar Nova Entrega</h2>
              <button onClick={() => setIsFormOpen(false)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>

            <form onSubmit={handleCreateDelivery} style={styles.modalForm}>
              
              {/* Cliente */}
              <div style={styles.formGroup}>
                <label htmlFor="form-client" style={styles.formLabel}>Cliente *</label>
                <select
                  id="form-client"
                  value={formClientId}
                  onChange={(e) => {
                    if (e.target.value === 'NEW_CLIENT') {
                      setIsClientModalOpen(true);
                      setFormClientId('');
                      setNewClientPassword(generateTempPassword());
                    } else {
                      setFormClientId(e.target.value);
                    }
                  }}
                  style={styles.formInput}
                  required
                >
                  <option value="">— Selecione o Cliente —</option>
                  <option value="NEW_CLIENT" style={{ fontWeight: 'bold', color: 'var(--primary, #007bff)' }}>+ Cadastrar Novo Cliente</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Entregador */}
              <div style={{ ...styles.formGroup, zIndex: 10 }}>
                <label htmlFor="form-driver" style={styles.formLabel}>Entregador Responsável *</label>
                <select
                  id="form-driver"
                  value={formDriverId}
                  onChange={(e) => setFormDriverId(e.target.value)}
                  style={styles.formInput}
                  required
                >
                  <option value="">— Selecione o Entregador —</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                {drivers.length === 0 && (
                  <span role="note" style={{ fontSize: '0.75rem', color: 'hsl(36,95%,32%)' }}>
                    Nenhum entregador cadastrado. Em Usuários, edite o colaborador e escolha a especialidade "Entregador / Delivery".
                  </span>
                )}
              </div>

              {/* Itens com Leitor de Código de Barras / Busca */}
              <div style={{ ...styles.formGroup, border: `1px solid ${styles.borderColor}`, padding: '12px', borderRadius: '10px' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: styles.sidebarWidgetText?.color, marginBottom: '8px' }}>
                  Itens da Entrega *
                </span>
                
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {/* Barcode scanner */}
                  <div style={{ flex: '1 1 200px', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <Barcode size={16} style={{ position: 'absolute', left: '10px', color: styles.primary }} />
                      <input
                        ref={skuInputRef}
                        type="text"
                        placeholder="Leitor Código de Barras (SKU)..."
                        value={skuInput}
                        onChange={(e) => setSkuInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleBarcodeSubmit(e);
                          }
                        }}
                        style={{ ...styles.formInput, width: '100%', paddingLeft: '34px', marginBottom: 0 }}
                      />
                    </div>
                  </div>

                  {/* Manual search */}
                  <div style={{ flex: '1 1 200px', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <Search size={16} style={{ position: 'absolute', left: '10px', color: styles.sidebarWidgetText?.color }} />
                      <input
                        type="text"
                        placeholder="Busca por nome..."
                        value={productSearchQuery}
                        onChange={(e) => {
                          setProductSearchQuery(e.target.value);
                          setIsProductSearching(e.target.value.trim() !== '');
                        }}
                        style={{ ...styles.formInput, width: '100%', paddingLeft: '34px', marginBottom: 0 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Cart list */}
                {cart.length > 0 ? (
                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: `1px solid ${styles.borderColor}`, borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: styles.isDark ? '#1e293b' : '#f8fafc', zIndex: 1 }}>
                        <tr style={{ borderBottom: `1px solid ${styles.borderColor}`, color: styles.sidebarWidgetText?.color }}>
                          <th style={{ padding: '6px' }}>Produto</th>
                          <th style={{ padding: '6px', textAlign: 'center' }}>Qtd</th>
                          <th style={{ padding: '6px', textAlign: 'center' }}>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cart.map((item) => (
                          <tr key={item.product.id} style={{ borderBottom: `1px solid ${styles.borderColor}`, color: styles.textMain }}>
                            <td style={{ padding: '6px' }}>{item.product.name}</td>
                            <td style={{ padding: '6px', textAlign: 'center' }}>
                              {isFractional(item.product.unit) ? (
                                <button
                                  type="button"
                                  onClick={() => setQtyDialog({ product: item.product, mode: 'edit' })}
                                  title="Alterar a quantidade"
                                  style={{ border: `1px solid ${styles.borderColor}`, background: 'none', cursor: 'pointer', borderRadius: '8px', padding: '3px 8px', fontWeight: 700, fontSize: '0.8rem', color: styles.textMain }}
                                >
                                  {formatQty(item.quantity, item.product.unit)} ✎
                                </button>
                              ) : (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <button type="button" onClick={() => updateQuantity(item.product.id, -1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: styles.textMain }}>
                                  <Minus size={14} />
                                </button>
                                <strong style={{ minWidth: '16px' }}>{item.quantity}</strong>
                                <button type="button" onClick={() => updateQuantity(item.product.id, 1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: styles.textMain }}>
                                  <Plus size={14} />
                                </button>
                              </div>
                            )}
                            </td>
                            <td style={{ padding: '6px', textAlign: 'center' }}>
                              <button type="button" onClick={() => removeFromCart(item.product.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'hsl(0,75%,55%)' }}>
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.8rem', color: styles.sidebarWidgetText?.color, backgroundColor: styles.isDark ? '#1e293b' : '#f8fafc', borderRadius: '8px' }}>
                    <ShoppingCart size={24} style={{ opacity: 0.5, margin: '0 auto 8px' }} />
                    Carrinho vazio. Busque ou escaneie um produto.
                  </div>
                )}

                {/* Produtos encontrados: abre abaixo da lista, usando toda a largura */}
                {isProductSearching && (
                  <div role="region" aria-label="Produtos encontrados" style={{
                    backgroundColor: styles.isDark ? '#26293b' : '#fff',
                    border: `1px solid ${styles.borderColor}`,
                    borderRadius: '10px', overflow: 'hidden', marginTop: '12px', width: '100%',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', fontSize: '0.75rem', fontWeight: 700, color: styles.sidebarWidgetText?.color, borderBottom: `1px solid ${styles.borderColor}` }}>
                      <span>{searchTotal} {searchTotal === 1 ? 'produto encontrado' : 'produtos encontrados'}</span>
                      <button type="button" onClick={() => { setProductSearchQuery(''); setIsProductSearching(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: styles.primary, fontWeight: 700, fontSize: '0.75rem' }}>Fechar ✕</button>
                    </div>
                    <div style={{ maxHeight: 'min(50vh, 420px)', overflowY: 'auto' }}>
                      {filteredSearch.length === 0 ? (
                        <div style={{ padding: '12px', fontSize: '0.8rem', textAlign: 'center', color: styles.sidebarWidgetText?.color }}>Nenhum produto correspondente.</div>
                      ) : (
                        <>
                          {filteredSearch.map(product => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => addToCart(product)}
                              style={{
                                width: '100%', padding: '9px 12px', border: 'none',
                                borderBottom: `1px solid ${styles.borderColor}`,
                                backgroundColor: 'transparent', color: styles.textMain,
                                textAlign: 'left', cursor: 'pointer', display: 'flex',
                                justifyContent: 'space-between', alignItems: 'center', gap: '10px'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = styles.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{product.name}</div>
                                <span style={{ fontSize: '0.7rem', color: styles.sidebarWidgetText?.color }}>SKU: {product.sku || 'Sem SKU'}</span>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                <strong style={{ color: styles.primary, fontSize: '0.82rem' }}>{priceLabel(product.price, product.unit)}</strong>
                                <div style={{ fontSize: '0.7rem', color: product.quantity <= 0 ? 'red' : styles.sidebarWidgetText?.color }}>Estoque: {formatQty(product.quantity, product.unit)}</div>
                              </div>
                            </button>
                          ))}
                          {searchTotal > filteredSearch.length && (
                            <div style={{ padding: '8px 12px', fontSize: '0.74rem', textAlign: 'center', color: styles.sidebarWidgetText?.color }}>
                              Mostrando {filteredSearch.length} de {searchTotal}. Digite mais para afinar a busca.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Pagamento */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Status do Pagamento *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setPaymentStatus('Já Pago')}
                    style={{
                      padding: '10px', borderRadius: '8px', border: '1px solid',
                      borderColor: paymentStatus === 'Já Pago' ? styles.primary : styles.borderColor,
                      backgroundColor: paymentStatus === 'Já Pago' ? (styles.isDark ? '#334155' : '#e2e8f0') : 'transparent',
                      color: paymentStatus === 'Já Pago' ? styles.primary : styles.textMain,
                      cursor: 'pointer', fontWeight: paymentStatus === 'Já Pago' ? 700 : 600, transition: 'all 0.15s'
                    }}
                  >
                    Já Pago
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatus('A Receber na Entrega')}
                    style={{
                      padding: '10px', borderRadius: '8px', border: '1px solid',
                      borderColor: paymentStatus === 'A Receber na Entrega' ? styles.primary : styles.borderColor,
                      backgroundColor: paymentStatus === 'A Receber na Entrega' ? (styles.isDark ? '#334155' : '#e2e8f0') : 'transparent',
                      color: paymentStatus === 'A Receber na Entrega' ? styles.primary : styles.textMain,
                      cursor: 'pointer', fontWeight: paymentStatus === 'A Receber na Entrega' ? 700 : 600, transition: 'all 0.15s'
                    }}
                  >
                    A Receber na Entrega
                  </button>
                </div>
              </div>

              {paymentStatus === 'A Receber na Entrega' && (() => {
                const total = cart.reduce((sum, item) => sum + lineTotal(item.product.price, item.quantity), 0);
                const changeValue = parseMoney(changeFor);
                const troco = Number.isFinite(changeValue) ? Math.max(0, changeValue - total) : 0;
                return (
                  <div style={{ border: `1px solid ${styles.borderColor}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: styles.textMain }}>Valor a cobrar do cliente</span>
                      <strong style={{ fontSize: '1.15rem', color: styles.textMain }}>
                        {cart.length > 0 ? brl(total) : <span style={{ fontSize: '0.8rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>adicione os produtos</span>}
                      </strong>
                    </div>

                    <div>
                      <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: styles.textMain }}>Como o cliente vai pagar? *</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: '8px' }}>
                        {PAYMENT_METHODS.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => { setPayMethod(m.id); if (m.id !== 'dinheiro') { setNeedsChange(false); setChangeFor(''); } }}
                            style={{
                              padding: '9px 8px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '0.82rem',
                              borderColor: payMethod === m.id ? styles.primary : styles.borderColor,
                              backgroundColor: payMethod === m.id ? (styles.isDark ? '#334155' : '#e2e8f0') : 'transparent',
                              color: payMethod === m.id ? styles.primary : styles.textMain,
                              fontWeight: payMethod === m.id ? 700 : 600,
                            }}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {payMethod === 'dinheiro' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: styles.textMain }}>O cliente precisa de troco?</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px' }}>
                          {[{ v: false, label: 'Não precisa' }, { v: true, label: 'Sim, precisa de troco' }].map(o => (
                            <button
                              key={String(o.v)}
                              type="button"
                              onClick={() => { setNeedsChange(o.v); if (!o.v) setChangeFor(''); }}
                              style={{
                                padding: '9px 8px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '0.82rem',
                                borderColor: needsChange === o.v ? styles.primary : styles.borderColor,
                                backgroundColor: needsChange === o.v ? (styles.isDark ? '#334155' : '#e2e8f0') : 'transparent',
                                color: needsChange === o.v ? styles.primary : styles.textMain,
                                fontWeight: needsChange === o.v ? 700 : 600,
                              }}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                        {needsChange && (
                          <div style={styles.formGroup}>
                            <label htmlFor="change-for" style={styles.formLabel}>Troco para quanto? (valor da nota do cliente)</label>
                            <input
                              id="change-for"
                              type="text"
                              inputMode="decimal"
                              placeholder="Ex.: 200"
                              value={changeFor}
                              onChange={(e) => setChangeFor(e.target.value)}
                              style={{ ...styles.formInput, width: '100%', minWidth: 0 }}
                            />
                            {Number.isFinite(changeValue) && changeValue > 0 && (
                              cart.length === 0 ? (
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>Adicione os produtos para calcular o troco.</span>
                              ) : (
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: changeValue >= total ? 'hsl(142,60%,28%)' : 'hsl(0,75%,45%)' }}>
                                  {changeValue >= total ? `O entregador vai levar ${brl(troco)} de troco.` : `O valor precisa ser igual ou maior que ${brl(total)}.`}
                                </span>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {usesCardMachine(payMethod || undefined) && (
                      <span style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color }}>
                        💳 O entregador será avisado para levar a maquininha{payMethod === 'pix' ? ' (por enquanto o Pix também é recebido nela)' : ''}.
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Endereço de Entrega */}
              <div style={{ border: `1px solid ${styles.borderColor}`, borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
                <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: styles.sidebarWidgetText?.color, marginBottom: '8px' }}>
                  Endereço de Entrega *
                </span>
                
                {pastAddresses.length > 0 && (
                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: styles.textMain, marginBottom: '6px' }}>
                      📍 Endereços que este cliente já pediu (clique para usar)
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {pastAddresses.map(a => {
                        const active = norm(addressStreet) === norm(a.street) && norm(addressNumber) === norm(a.number) && norm(addressNeighborhood) === norm(a.neighborhood);
                        return (
                          <button
                            key={a.key}
                            type="button"
                            onClick={() => usePastAddress(a)}
                            aria-pressed={active}
                            style={{
                              width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', border: '1px solid',
                              borderColor: active ? styles.primary : styles.borderColor,
                              backgroundColor: active ? (styles.isDark ? '#334155' : '#e2e8f0') : 'transparent',
                              color: styles.textMain,
                            }}
                          >
                            <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{a.street}, {a.number} - {a.neighborhood}</div>
                            {a.reference && <div style={{ fontSize: '0.72rem', color: styles.sidebarWidgetText?.color }}>Ref.: {a.reference}</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <DeliveryMap
                  onAddressSelect={handleMapAddressSelect}
                  jumpTo={mapJump}
                  leftContent={
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginTop: '4px' }}>
                        <input
                          type="text"
                          placeholder="Rua/Avenida *"
                          value={addressStreet}
                          readOnly
                          style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '6px 8px', marginBottom: 0, backgroundColor: styles.isDark ? '#334155' : '#f1f5f9', cursor: 'not-allowed', color: styles.isDark ? '#94a3b8' : '#64748b' }}
                        />
                        <input
                          type="text"
                          placeholder="Número * (S/N se não tiver)"
                          value={addressNumber}
                          onChange={(e) => setAddressNumber(e.target.value)}
                          style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '6px 8px', marginBottom: 0 }}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px', marginTop: '10px' }}>
                        <input
                          type="text"
                          placeholder="Bairro *"
                          value={addressNeighborhood}
                          onChange={(e) => setAddressNeighborhood(e.target.value)}
                          style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '6px 8px', marginBottom: 0 }}
                        />
                        <input
                          type="text"
                          placeholder="Ponto de Referência"
                          value={addressReference}
                          onChange={(e) => setAddressReference(e.target.value)}
                          style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '6px 8px', marginBottom: 0 }}
                        />
                      </div>

                      {/* Delivery Time Selection */}
                      <div style={{ marginTop: '16px', borderTop: `1px dashed ${styles.borderColor}`, paddingTop: '12px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', color: styles.textMain }}>
                          Qual horário?
                        </label>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', marginTop: '6px' }}>
                            <input
                              type="checkbox"
                              checked={deliveryAsap}
                              onChange={(e) => {
                                setDeliveryAsap(e.target.checked);
                                if (e.target.checked) setDeliveryTime('');
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            O mais breve possível
                          </label>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <select
                              value={deliveryDate}
                              onChange={(e) => {
                                setDeliveryDate(e.target.value);
                                setDeliveryTime(''); // reset time when date changes
                                if (e.target.value) setDeliveryAsap(false);
                              }}
                              style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '4px 8px', marginBottom: 0 }}
                            >
                              <option value="">Selecione a Data...</option>
                              {deliverySlots.days.map(day => (
                                <option key={day.value} value={day.value}>{day.label}</option>
                              ))}
                            </select>

                            <select
                              value={deliveryTime}
                              onChange={(e) => {
                                setDeliveryTime(e.target.value);
                                if (e.target.value) setDeliveryAsap(false);
                              }}
                              disabled={!deliveryDate}
                              style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '4px 8px', marginBottom: 0 }}
                            >
                              <option value="">Selecione a Hora...</option>
                              {deliveryDate && deliverySlots.timesByDay[deliveryDate]?.map(time => (
                                <option key={time} value={time}>{time}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        
                        <div style={{ marginTop: '12px' }}>
                          <input
                            type="text"
                            maxLength={50}
                            placeholder="Observação (Ex: Deixar na portaria, Cuidado com o cachorro) - Máx 50 caract."
                            value={deliveryObs}
                            onChange={(e) => setDeliveryObs(e.target.value)}
                            style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '6px 8px', marginBottom: 0 }}
                          />
                          <div style={{ fontSize: '0.65rem', color: styles.sidebarWidgetText?.color, textAlign: 'right', marginTop: '4px' }}>
                            {deliveryObs.length}/50
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />
              </div>

              {/* Actions */}
              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  style={{
                    padding: '10px 20px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`,
                    background: 'none', color: styles.textMain, cursor: 'pointer', fontSize: '0.85rem'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-save"
                  style={{
                    padding: '10px 20px', borderRadius: '8px', border: 'none',
                    fontSize: '0.85rem', fontWeight: 700, marginLeft: '10px'
                  }}
                >
                  Agendar
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
      {/* ======================================= */}
      {/* 4. MODAL DE SOLICITAÇÃO DE SUPORTE      */}
      {/* ======================================= */}
      {supportModalDelivery && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '400px' }} role="dialog" aria-modal="true" aria-labelledby="support-modal-title">
            <div style={styles.modalHeader}>
              <h2 id="support-modal-title" style={styles.modalTitle}>
                <LifeBuoy size={20} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', color: 'hsl(0, 75%, 50%)' }} />
                Solicitar Suporte
              </h2>
              <button
                onClick={() => setSupportModalDelivery(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: styles.sidebarWidgetText?.color || '#999', display: 'flex', alignItems: 'center', padding: 0
                }}
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color || '#666', marginBottom: '16px' }}>
              Selecione a ocorrência que melhor descreve o problema atual com a entrega:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
              {SUPPORT_REASONS.map(reason => (
                <button
                  key={reason}
                  onClick={() => handleRequestSupport(supportModalDelivery, reason)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${styles.borderColor}`,
                    backgroundColor: styles.background,
                    color: styles.textMain,
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = styles.primary;
                    e.currentTarget.style.backgroundColor = `${styles.primary}08`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = styles.borderColor;
                    e.currentTarget.style.backgroundColor = styles.background;
                  }}
                >
                  {reason}
                </button>
              ))}
            </div>

            <div style={{ ...styles.modalActions, marginTop: '20px' }}>
              <button
                onClick={() => setSupportModalDelivery(null)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${styles.borderColor}`,
                  background: 'none',
                  color: styles.textMain,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* 5. MODAL DE DECISÃO DO SUPORTE (GERENTE) */}
      {/* ======================================= */}
      {managerSupportModalDelivery && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '450px' }} role="dialog" aria-modal="true" aria-labelledby="manager-support-modal-title">
            <div style={styles.modalHeader}>
              <h2 id="manager-support-modal-title" style={styles.modalTitle}>
                <LifeBuoy size={20} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', color: styles.primary }} />
                Decisão do Suporte
              </h2>
              <button
                onClick={() => setManagerSupportModalDelivery(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: styles.sidebarWidgetText?.color || '#999', display: 'flex', alignItems: 'center', padding: 0
                }}
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: styles.sidebarWidgetText?.color || '#666' }}>Entregador:</span> <strong>{managerSupportModalDelivery.driver_name}</strong>
              </div>
              <div>
                <span style={{ color: styles.sidebarWidgetText?.color || '#666' }}>Problema Relatado:</span>
                <div style={{
                  marginTop: '4px', padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.12)', borderRadius: '6px',
                  color: '#ef4444', fontWeight: 600
                }}>
                  "{managerSupportModalDelivery.support_reason}"
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Selecione uma decisão recomendada:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  {managerSupportModalDelivery.support_reason && 
                   (DECISIONS_BY_REASON[managerSupportModalDelivery.support_reason] || []).map(option => (
                    <label key={option} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '8px',
                      borderRadius: '6px', border: `1px solid ${selectedDecisionOption === option ? styles.primary : styles.borderColor}`,
                      cursor: 'pointer', backgroundColor: selectedDecisionOption === option ? `${styles.primary}08` : 'transparent',
                      color: styles.textMain
                    }}>
                      <input
                        type="radio"
                        name="support-decision-opt"
                        checked={selectedDecisionOption === option}
                        onChange={() => {
                          setSelectedDecisionOption(option);
                          setCustomDecisionText('');
                        }}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px',
                    borderRadius: '6px', border: `1px solid ${selectedDecisionOption === 'custom' ? styles.primary : styles.borderColor}`,
                    cursor: 'pointer', backgroundColor: selectedDecisionOption === 'custom' ? `${styles.primary}08` : 'transparent',
                    color: styles.textMain
                  }}>
                    <input
                      type="radio"
                      name="support-decision-opt"
                      checked={selectedDecisionOption === 'custom'}
                      onChange={() => setSelectedDecisionOption('custom')}
                    />
                    <span>Outra instrução personalizada...</span>
                  </label>
                </div>
              </div>

              {selectedDecisionOption === 'custom' && (
                <div style={styles.formGroup}>
                  <label htmlFor="custom-instruction" style={styles.formLabel}>Digite a instrução personalizada:</label>
                  <textarea
                    id="custom-instruction"
                    rows={3}
                    placeholder="Ex: Vá ao ponto de encontro alternativo na praça principal..."
                    value={customDecisionText}
                    onChange={(e) => setCustomDecisionText(e.target.value)}
                    style={{ ...styles.formInput, width: '100%', resize: 'vertical', marginTop: '4px', fontFamily: 'inherit' }}
                  />
                </div>
              )}
            </div>

            <div style={{ ...styles.modalActions, marginTop: '20px', display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => handleResolveSupport(managerSupportModalDelivery.id)}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '8px',
                  backgroundColor: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.25)',
                  cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700
                }}
                title="Marcar o suporte como totalmente resolvido (limpa a ocorrência do motorista)"
              >
                Resolver Suporte
              </button>

              <button
                type="button"
                onClick={() => {
                  const finalDecision = selectedDecisionOption === 'custom' ? customDecisionText : selectedDecisionOption;
                  if (!finalDecision) {
                    alert('Por favor, selecione ou digite uma decisão.');
                    return;
                  }
                  const isCancel = finalDecision.toLowerCase().includes('cancelad') || finalDecision.toLowerCase().includes('retornar à base');
                  handleSaveSupportDecision(managerSupportModalDelivery.id, finalDecision, isCancel);
                }}
                className="btn-save"
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '8px', border: 'none',
                  fontSize: '0.85rem', fontWeight: 700
                }}
              >
                Enviar Decisão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* 6. MODAL DE RASTREAMENTO EM TEMPO REAL  */}
      {/* ======================================= */}
      {trackingDelivery && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }} role="dialog" aria-modal="true" aria-labelledby="tracking-modal-title">
            <div style={styles.modalHeader}>
              <h2 id="tracking-modal-title" style={{ ...styles.modalTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Compass size={22} className="spin-icon" style={{ color: styles.primary, animation: trackingDelivery.status === 'a-caminho' ? 'spin 6s linear infinite' : 'none' }} />
                Rastreamento em Tempo Real
              </h2>
              <button
                onClick={() => setTrackingDelivery(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: styles.sidebarWidgetText?.color || '#999',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
                aria-label="Fechar"
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth >= 768 ? '1fr 2fr' : '1fr', gap: '20px', margin: '10px 0' }}>
              {/* Informações da Entrega */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
                <div style={{ padding: '12px', backgroundColor: styles.background, borderRadius: '8px', border: `1px solid ${styles.borderColor}` }}>
                  <div style={{ fontWeight: 700, color: styles.textMain, fontSize: '0.95rem', marginBottom: '8px' }}>
                    Detalhes do Pedido
                  </div>
                  <div style={{ marginBottom: '6px' }}><span style={{ color: styles.sidebarWidgetText?.color }}>Cliente:</span> <strong>{trackingDelivery.client_name}</strong></div>
                  <div style={{ marginBottom: '6px' }}><span style={{ color: styles.sidebarWidgetText?.color }}>Itens:</span> <strong>{trackingDelivery.payment ? stripPaymentTag(trackingDelivery.items) : trackingDelivery.items}</strong></div>
                  {trackingDelivery.payment && <div style={{ marginBottom: '8px' }}><DeliveryPaymentBox payment={trackingDelivery.payment} /></div>}
                  <div style={{ marginBottom: '6px' }}><span style={{ color: styles.sidebarWidgetText?.color }}>Entregador:</span> <strong>{trackingDelivery.driver_name || 'Não atribuído'}</strong></div>
                  <div style={{ marginBottom: '6px' }}><span style={{ color: styles.sidebarWidgetText?.color }}>Horário:</span> <strong>{trackingDelivery.scheduled_time}</strong></div>
                </div>

                <div style={{ padding: '12px', backgroundColor: styles.background, borderRadius: '8px', border: `1px solid ${styles.borderColor}` }}>
                  <div style={{ fontWeight: 700, color: styles.textMain, fontSize: '0.95rem', marginBottom: '8px' }}>
                    Pontos do Roteiro
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'hsl(210, 85%, 45%)', marginTop: '5px' }}></span>
                    <div>
                      <strong>Origem (Loja):</strong> Petshop La Viola
                      <div style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>Rua Dr. Ibraim Hannas, 406</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'hsl(36, 95%, 55%)', marginTop: '5px' }}></span>
                    <div>
                      <strong>Entregador:</strong> {trackingDelivery.driver_name || 'Nenhum'}
                      <div style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>
                        {trackingDelivery.status === 'a-caminho' ? 'Em deslocamento (Tempo real)' : trackingDelivery.status === 'concluida' ? 'Entrega concluída no destino' : 'Aguardando despacho na loja'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'hsl(0, 75%, 50%)', marginTop: '5px' }}></span>
                    <div>
                      <strong>Destino (Cliente):</strong> {trackingDelivery.client_name}
                      <div style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>{trackingDelivery.client_address}</div>
                    </div>
                  </div>
                </div>

                {trackingDelivery.status === 'a-caminho' && (
                  <div style={{ padding: '12px', backgroundColor: 'rgba(75, 192, 192, 0.08)', borderRadius: '8px', border: '1px solid rgba(75, 192, 192, 0.2)' }}>
                    {(() => {
                      const dist = calculateDistance(
                        trackingDelivery.driver_lat, trackingDelivery.driver_lng,
                        trackingDelivery.client_lat, trackingDelivery.client_lng
                      );
                      const totalDist = calculateDistance(
                        PETSHOP_COORDS.lat, PETSHOP_COORDS.lng,
                        trackingDelivery.client_lat, trackingDelivery.client_lng
                      );
                      const percentDone = totalDist > 0 ? Math.min(100, Math.max(0, ((totalDist - dist) / totalDist) * 100)) : 0;
                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'hsl(142, 60%, 35%)', marginBottom: '5px' }}>
                            <span>Distância Restante</span>
                            <span>{(dist / 1000).toFixed(2)} km</span>
                          </div>
                          <div className="progress-bar-container" style={{ margin: '5px 0' }}>
                            <div className="progress-bar-fill" style={{ width: `${percentDone}%`, backgroundColor: 'hsl(142, 60%, 45%)' }}></div>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color, fontStyle: 'italic', marginTop: '5px' }}>
                            Simulador/GPS atualizando em tempo real.
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Mapa */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div ref={trackingMapContainerRef} style={{ height: '400px', width: '100%', borderRadius: '12px', border: `1px solid ${styles.borderColor}`, overflow: 'hidden' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: styles.sidebarWidgetText?.color }}>
                  <span>Dica: Use os controles do mapa para zoom e navegação.</span>
                  {trackingDelivery.status === 'a-caminho' && !isSupabaseConfigured && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>Velocidade da simulação:</span>
                      {[1, 5, 10].map(s => (
                        <button key={s} onClick={() => setSimSpeed(s)} style={{ fontSize: '0.75rem', padding: '2px 6px', backgroundColor: simSpeed === s ? styles.primary : styles.background, color: simSpeed === s ? '#fff' : styles.textMain, border: `1px solid ${styles.borderColor}`, borderRadius: '4px', cursor: 'pointer' }}>
                          {s}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ ...styles.modalActions, marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setTrackingDelivery(null)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: `1px solid ${styles.borderColor}`,
                  background: 'none',
                  color: styles.textMain,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  marginLeft: 'auto'
                }}
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* MODAL: CRIAR NOVO CLIENTE               */}
      {/* ======================================= */}
      {qtyDialog && (
        <QuantityDialog
          styles={styles}
          product={qtyDialog.product}
          mode={qtyDialog.mode}
          alreadyInCart={cart.find(i => i.product.id === qtyDialog.product.id)?.quantity || 0}
          initialQty={cart.find(i => i.product.id === qtyDialog.product.id)?.quantity}
          onConfirm={confirmQuantity}
          onClose={() => setQtyDialog(null)}
        />
      )}

      {isClientModalOpen && (
        <div style={{ ...styles.modalOverlay, zIndex: 9999 }}>
          <div style={{ ...styles.modalContent, maxWidth: '500px', overflowX: 'hidden' }} role="dialog" aria-modal="true" aria-labelledby="create-client-title">
            <div style={styles.modalHeader}>
              <h2 id="create-client-title" style={styles.modalTitle}>Novo Cliente</h2>
              <button onClick={() => setIsClientModalOpen(false)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={handleCreateClient} style={styles.modalForm}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Nome Completo *</label>
                <input type="text" value={newClientFullName} onChange={e => setNewClientFullName(e.target.value)} style={{ ...styles.formInput, width: '100%', minWidth: 0 }} required />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>E-mail *</label>
                <input type="email" value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)} style={{ ...styles.formInput, width: '100%', minWidth: 0 }} required />
              </div>
              {/* minmax(0, 1fr) evita que os campos estourem a largura do modal; em telas estreitas vira uma coluna só */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '15px' }}>
                <div style={{ ...styles.formGroup, minWidth: 0 }}>
                  <label style={styles.formLabel}>Login (Username) *</label>
                  <input type="text" value={newClientUsername} onChange={e => setNewClientUsername(e.target.value)} style={{ ...styles.formInput, width: '100%', minWidth: 0 }} required />
                </div>
                <div style={{ ...styles.formGroup, minWidth: 0 }}>
                  <label style={styles.formLabel}>Celular</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="(21) 99999-9999"
                    maxLength={15}
                    value={newClientPhone}
                    onChange={e => setNewClientPhone(formatPhoneBR(e.target.value))}
                    style={{ ...styles.formInput, width: '100%', minWidth: 0 }}
                  />
                </div>
              </div>
              <div style={{ ...styles.formGroup, minWidth: 0 }}>
                <label style={styles.formLabel} htmlFor="new-client-password">Senha *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="new-client-password"
                    type={showClientPassword ? 'text' : 'password'}
                    value={newClientPassword}
                    onChange={e => setNewClientPassword(e.target.value)}
                    autoComplete="new-password"
                    style={{ ...styles.formInput, width: '100%', minWidth: 0, paddingRight: '42px' }}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientPassword(v => !v)}
                    aria-label={showClientPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    title={showClientPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', color: styles.textMain }}
                  >
                    {showClientPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <span style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>
                  Senha temporária sorteada. Anote e avise o cliente: no primeiro login ele será obrigado a trocá-la.
                </span>
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setIsClientModalOpen(false)} style={{ padding: '10px 16px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`, background: 'none', color: styles.textMain, cursor: 'pointer', fontSize: '0.85rem' }}>Cancelar</button>
                <button type="submit" disabled={isSavingClient} className="btn-save" style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', fontSize: '0.85rem', fontWeight: 700 }}>
                  {isSavingClient ? 'Salvando...' : 'Criar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </section>
  );
};
