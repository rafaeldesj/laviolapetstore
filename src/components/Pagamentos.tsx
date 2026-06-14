import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CreditCard, CalendarDays, Clock, CheckCircle2, XCircle,
  AlertCircle, Loader2, PawPrint, RefreshCw, ChevronRight,
  Lock, ShieldCheck, QrCode, Landmark, Smartphone, X, MapPin, Truck, Search
} from 'lucide-react';
import { supabase, mockSupabaseDb, isSupabaseConfigured, logAction } from '../supabaseClient';
import type { Appointment } from '../supabaseClient';
import type { AuthUser } from '../hooks/useAuth';

declare const L: any;

const PETSHOP_COORDS = { lat: -22.9122, lng: -43.5606 };
const ADDRESS_SUGGESTIONS = [
  { name: 'Rua Catolândia, Campo Grande, Rio de Janeiro - RJ', lat: -22.8901, lng: -43.5891 },
  { name: 'Rua Arthur Rios, 1200, Campo Grande, Rio de Janeiro - RJ', lat: -22.8995, lng: -43.5580 },
  { name: 'Avenida Cesário de Melo, 2500, Campo Grande, Rio de Janeiro - RJ', lat: -22.9025, lng: -43.5610 },
  { name: 'Rua Viúva Dantas, 350, Campo Grande, Rio de Janeiro - RJ', lat: -22.9050, lng: -43.5560 },
  { name: 'Estrada da Caroba, 500, Campo Grande, Rio de Janeiro - RJ', lat: -22.8920, lng: -43.5600 },
  { name: 'Estrada do Cabuçu, 800, Campo Grande, Rio de Janeiro - RJ', lat: -22.8912, lng: -43.5685 },
  { name: 'Rua Olinda Ellis, Campo Grande, Rio de Janeiro - RJ', lat: -22.8950, lng: -43.5520 },
  { name: 'Rua Augusto de Vasconcelos, Campo Grande, Rio de Janeiro - RJ', lat: -22.9030, lng: -43.5590 },
  { name: 'Rua Virgílio Brígido, 148, Campo Grande, Rio de Janeiro - RJ', lat: -22.8980, lng: -43.5620 },
  { name: 'Rua Avaré, 5, Campo Grande, Rio de Janeiro - RJ', lat: -22.9010, lng: -43.5670 },
  { name: 'Rua Luminosa, n30, Campo Grande, Rio de Janeiro - RJ', lat: -22.8970, lng: -43.5710 }
];
interface PagamentosProps {
  styles: any;
  currentUser: AuthUser;
  selectedProduct: { name: string; price: number } | null;
  setSelectedProduct: (product: { name: string; price: number } | null) => void;
  setActiveSection: (section: string) => void;
}

const serviceValueMap: Record<string, number> = {
  'Banho & Tosa': 80,
  'Consulta Veterinária': 150,
  'Vacinação': 95,
  'Hotelzinho / Creche': 120,
  'Outro': 70,
};

const statusConfig: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode; label: string }> = {
  'Agendado':     { bg: 'rgba(54,162,235,0.08)',  text: 'hsl(210,85%,45%)', border: 'rgba(54,162,235,0.25)',  icon: <Clock size={12} />,         label: 'Agendado' },
  'Em Andamento': { bg: 'rgba(255,206,86,0.08)',  text: 'hsl(36,95%,45%)',  border: 'rgba(255,206,86,0.25)',  icon: <Loader2 size={12} />,       label: 'Em Andamento' },
  'Concluído':    { bg: 'rgba(75,192,192,0.08)',  text: 'hsl(142,60%,40%)', border: 'rgba(75,192,192,0.25)',  icon: <CheckCircle2 size={12} />,  label: 'Concluído' },
  'Cancelado':    { bg: 'rgba(255,99,132,0.08)',  text: 'hsl(0,75%,55%)',   border: 'rgba(255,99,132,0.25)',  icon: <XCircle size={12} />,       label: 'Cancelado' },
};

const paymentMethods = [
  {
    id: 'pix',
    icon: <QrCode size={24} />,
    label: 'PIX',
    description: 'Pagamento instantâneo via QR Code',
    available: true,
    color: 'hsl(160,60%,40%)',
    bg: 'rgba(75,192,150,0.08)',
    border: 'rgba(75,192,150,0.3)',
  },
  {
    id: 'credito',
    icon: <CreditCard size={24} />,
    label: 'Cartão de Crédito',
    description: 'Em até 12x sem juros • Em breve',
    available: false,
    color: 'hsl(262,80%,58%)',
    bg: 'rgba(139,92,246,0.06)',
    border: 'rgba(139,92,246,0.2)',
  },
  {
    id: 'debito',
    icon: <Landmark size={24} />,
    label: 'Cartão de Débito',
    description: 'Débito à vista • Em breve',
    available: false,
    color: 'hsl(210,85%,45%)',
    bg: 'rgba(54,162,235,0.06)',
    border: 'rgba(54,162,235,0.2)',
  },
  {
    id: 'link',
    icon: <Smartphone size={24} />,
    label: 'Link de Pagamento',
    description: 'Receba no WhatsApp ou e-mail • Em breve',
    available: false,
    color: 'hsl(36,95%,45%)',
    bg: 'rgba(255,206,86,0.06)',
    border: 'rgba(255,206,86,0.2)',
  },
];

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch { return iso; }
};

export const Pagamentos: React.FC<PagamentosProps> = ({ 
  styles, 
  currentUser,
  selectedProduct,
  setSelectedProduct,
  setActiveSection
}) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Product checkout state variables
  const [deliveryMethod, setDeliveryMethod] = useState<'retirada' | 'delivery'>('retirada');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [isAddressResolved, setIsAddressResolved] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isPayingProduct, setIsPayingProduct] = useState(false);
  const [showProductSuccessModal, setShowProductSuccessModal] = useState(false);
  const [productLat, setProductLat] = useState(-22.8973);
  const [productLng, setProductLng] = useState(-43.5639);
  const [prodPaymentMethod, setProdPaymentMethod] = useState<'pix' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'todos' | 'concluidos' | 'agendados'>('todos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  // Map refs for mini-map
  const miniMapContainerRef = useRef<HTMLDivElement | null>(null);
  const miniMapInstanceRef = useRef<any>(null);
  const miniMarkersRef = useRef<{ petshop?: any; client?: any }>({});
  const miniRouteLineRef = useRef<any>(null);

  const fetchAppointments = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('appointments')
          .select('*, pets(*)')
          .eq('owner_id', currentUser.id)
          .order('scheduled_at', { ascending: false });
        if (error) throw error;
        const mapped = (data || []).map((item: any) => ({
          id: item.id,
          pet_id: item.pet_id,
          pet_name: item.pets?.name || item.pet_name || 'Desconhecido',
          owner_id: item.owner_id,
          service_type: item.service_type,
          scheduled_at: item.scheduled_at,
          status: item.status,
          notes: item.notes || '',
          created_at: item.created_at,
        }));
        setAppointments(mapped);
      } else {
        const { data } = await mockSupabaseDb.getAppointments(currentUser.id, false);
        setAppointments(data || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar serviços.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const filtered = appointments.filter(a => {
    if (a.status === 'Cancelado') return false;
    if (activeTab === 'concluidos') return a.status === 'Concluído';
    if (activeTab === 'agendados')  return a.status === 'Agendado' || a.status === 'Em Andamento';
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // Reset payment panel when selection changes
    setShowPaymentMethods(false);
    setSelectedMethod(null);
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(a => a.id)));
    }
    setShowPaymentMethods(false);
    setSelectedMethod(null);
  };

  const selectedAppointments = appointments.filter(a => selectedIds.has(a.id));
  const selectedTotal = selectedAppointments.reduce(
    (sum, a) => sum + (serviceValueMap[a.service_type] || 70), 0
  );

  const totalEstimado = appointments
    .filter(a => a.status !== 'Cancelado')
    .reduce((sum, a) => sum + (serviceValueMap[a.service_type] || 70), 0);

  const formatSuggestionName = useCallback((sugName: string, queryText: string) => {
    const numberMatch = queryText.match(/,\s*(\d+[a-zA-Z]?)\b/) || queryText.match(/\s+(\d+[a-zA-Z]?)$/);
    if (!numberMatch) {
      return sugName;
    }
    const houseNumber = numberMatch[1];
    if (sugName.includes(houseNumber)) {
      return sugName;
    }
    const parts = sugName.split(',');
    if (parts.length > 0) {
      parts[0] = `${parts[0].trim()}, ${houseNumber}`;
      return parts.join(', ');
    }
    return sugName;
  }, []);

  const handleSelectSuggestion = useCallback((sug: { name: string; lat: number; lng: number }) => {
    const finalName = formatSuggestionName(sug.name, deliveryAddress);

    // Extract house number if user typed one (e.g. ", 300" or " 300")
    const numberMatch = deliveryAddress.match(/,\s*(\d+[a-zA-Z]?)\b/) || deliveryAddress.match(/\s+(\d+[a-zA-Z]?)$/);
    let lat = sug.lat;
    let lng = sug.lng;

    if (numberMatch) {
      const houseNumber = numberMatch[1];
      // Apply a tiny deterministic coordinate offset so the pin moves according to the house number
      const numVal = parseInt(houseNumber, 10) || 0;
      lat += (numVal % 10) * 0.00015 - 0.0007;
      lng += (numVal % 7) * 0.00015 - 0.0005;
    }

    setDeliveryAddress(finalName);
    setProductLat(lat);
    setProductLng(lng);
    setIsAddressResolved(true);
    setShowSuggestions(false);
  }, [deliveryAddress, formatSuggestionName]);

  const handleResolveAddress = useCallback(async () => {
    const addr = deliveryAddress.trim();
    if (!addr) {
      setIsAddressResolved(false);
      return;
    }
    
    setIsSearching(true);
    try {
      const biasQuery = addr.toLowerCase().includes('rio de janeiro') || addr.toLowerCase().includes('campo grande')
        ? addr
        : `${addr}, Campo Grande, Rio de Janeiro`;

      // 1. Try querying Nominatim with full address (with number)
      let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(biasQuery)}&limit=1&countrycodes=br`;
      let res = await fetch(url, {
        headers: {
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'User-Agent': 'LaViolaDeliveryApp/2.0 (rafael.laviola@example.com)'
        }
      });
      if (res.ok) {
        let data = await res.json();
        if (data && data.length > 0) {
          setProductLat(parseFloat(data[0].lat));
          setProductLng(parseFloat(data[0].lon));
          setIsAddressResolved(true);
          return;
        }
      }

      // 2. If no result found, strip the house number and query the street only, then apply offset
      const numberMatch = addr.match(/,\s*(\d+[a-zA-Z]?)\b/) || addr.match(/\s+(\d+[a-zA-Z]?)$/);
      if (numberMatch) {
        const streetOnlyQuery = biasQuery.replace(numberMatch[0], '');
        url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(streetOnlyQuery)}&limit=1&countrycodes=br`;
        res = await fetch(url, {
          headers: {
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'User-Agent': 'LaViolaDeliveryApp/2.0 (rafael.laviola@example.com)'
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            const numVal = parseInt(numberMatch[1], 10) || 0;
            const latOffset = (numVal % 10) * 0.00015 - 0.0007;
            const lngOffset = (numVal % 7) * 0.00015 - 0.0005;
            setProductLat(parseFloat(data[0].lat) + latOffset);
            setProductLng(parseFloat(data[0].lon) + lngOffset);
            setIsAddressResolved(true);
            return;
          }
        }
      }
    } catch (err) {
      console.error('Error in direct resolve:', err);
    } finally {
      setIsSearching(false);
    }

    // Fallback: deterministic offset if OSM fails or is offline
    const normalized = addr.toLowerCase();
    let matchedLat = PETSHOP_COORDS.lat;
    let matchedLng = PETSHOP_COORDS.lng;
    let matched = false;

    if (normalized.includes('catolandia') || normalized.includes('catolândia')) {
      matchedLat = -22.8901;
      matchedLng = -43.5891;
      matched = true;
    } else if (normalized.includes('arthur rios')) {
      matchedLat = -22.8995;
      matchedLng = -43.5580;
      matched = true;
    } else if (normalized.includes('cesario') || normalized.includes('cesário')) {
      matchedLat = -22.9025;
      matchedLng = -43.5610;
      matched = true;
    } else if (normalized.includes('viuva') || normalized.includes('viúva')) {
      matchedLat = -22.9050;
      matchedLng = -43.5560;
      matched = true;
    } else if (normalized.includes('caroba')) {
      matchedLat = -22.8920;
      matchedLng = -43.5600;
      matched = true;
    } else if (normalized.includes('cabucu') || normalized.includes('cabuçu')) {
      matchedLat = -22.8912;
      matchedLng = -43.5685;
      matched = true;
    }

    if (matched) {
      setProductLat(matchedLat);
      setProductLng(matchedLng);
      setIsAddressResolved(true);
    } else {
      let hash = 0;
      for (let i = 0; i < normalized.length; i++) {
        hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
      }
      const latOffset = ((Math.abs(hash) % 100) / 100) * 0.02 - 0.01;
      const lngOffset = ((Math.abs(hash >> 8) % 100) / 100) * 0.02 - 0.01;
      
      setProductLat(PETSHOP_COORDS.lat + latOffset);
      setProductLng(PETSHOP_COORDS.lng + lngOffset);
      setIsAddressResolved(true);
    }
  }, [deliveryAddress]);

  // Sync selectedProduct and reset variables
  useEffect(() => {
    if (selectedProduct) {
      setDeliveryMethod('retirada');
      setDeliveryAddress('');
      setIsAddressResolved(false);
      setSuggestions([]);
      setProductLat(PETSHOP_COORDS.lat);
      setProductLng(PETSHOP_COORDS.lng);
      setProdPaymentMethod(null);
    }
  }, [selectedProduct]);

  // Real-time Autocomplete geocoding API fetch (Debounced 400ms)
  useEffect(() => {
    const query = deliveryAddress.trim();
    if (!query || query.length < 3 || isAddressResolved || deliveryMethod !== 'delivery') {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const biasQuery = query.toLowerCase().includes('rio de janeiro') || query.toLowerCase().includes('campo grande')
          ? query
          : `${query}, Campo Grande, Rio de Janeiro`;

        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(biasQuery)}&limit=6&addressdetails=1&countrycodes=br`;
        
        const res = await fetch(url, {
          headers: {
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'User-Agent': 'LaViolaDeliveryApp/2.0 (rafael.laviola@example.com)'
          }
        });

        if (res.ok) {
          const data = await res.json();
          const mapped = data.map((item: any) => {
            let displayName = item.display_name;
            displayName = displayName
              .replace(/, Região Geográfica.*$/, '')
              .replace(/, Região Metropolitana.*$/, '')
              .replace(/, Região Sudeste.*$/, '')
              .replace(/, Região de Governo.*$/, '')
              .replace(/, Rio de Janeiro, Região Intermediária.*$/, '')
              .replace(/, Brasil$/, '');

            return {
              name: displayName,
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon)
            };
          });
          setSuggestions(mapped);
        }
      } catch (err) {
        console.error('Error fetching autocomplete:', err);
        // Fallback: search predefined mock suggestions offline
        const offlineMatches = ADDRESS_SUGGESTIONS.filter(item =>
          item.name.toLowerCase().includes(query.toLowerCase())
        );
        setSuggestions(offlineMatches);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [deliveryAddress, isAddressResolved, deliveryMethod]);

  // Leaflet Map Rendering and Updates for Checkout Mini Map with Real-Road Route
  useEffect(() => {
    let active = true;

    if (
      typeof window === 'undefined' || 
      !(window as any).L || 
      !miniMapContainerRef.current || 
      !isAddressResolved || 
      !deliveryAddress.trim() || 
      deliveryMethod !== 'delivery'
    ) {
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove();
        miniMapInstanceRef.current = null;
        miniMarkersRef.current = {};
        miniRouteLineRef.current = null;
      }
      return;
    }

    const L = (window as any).L;
    const mapContainer = miniMapContainerRef.current;

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

    const setupMap = async () => {
      // 1. Fetch real street route coordinates from OSRM
      let routeCoords: [number, number][] = [
        [PETSHOP_COORDS.lat, PETSHOP_COORDS.lng],
        [productLat, productLng]
      ];

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${PETSHOP_COORDS.lng},${PETSHOP_COORDS.lat};${productLng},${productLat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (res.ok && active) {
          const data = await res.json();
          if (data.routes && data.routes.length > 0) {
            const coords = data.routes[0].geometry.coordinates;
            routeCoords = coords.map((c: any) => [c[1], c[0]]);
          }
        }
      } catch (err) {
        console.error('Error fetching OSRM route:', err);
      }

      if (!active) return;

      // 2. Initialize map if not loaded
      if (!miniMapInstanceRef.current) {
        const initialCenter = [
          (PETSHOP_COORDS.lat + productLat) / 2,
          (PETSHOP_COORDS.lng + productLng) / 2
        ];

        const map = L.map(mapContainer).setView(initialCenter, 14);
        miniMapInstanceRef.current = map;

        L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
          attribution: 'Map data © Google'
        }).addTo(map);

        miniMarkersRef.current.petshop = L.marker([PETSHOP_COORDS.lat, PETSHOP_COORDS.lng], { icon: petshopIcon })
          .addTo(map)
          .bindPopup('<b>Petshop La Viola</b><br>Origem das Entregas');

        miniMarkersRef.current.client = L.marker([productLat, productLng], { icon: clientIcon })
          .addTo(map)
          .bindPopup(`<b>Seu Endereço</b><br>${deliveryAddress}`);

        // Draw real street route line (solid or dashed)
        miniRouteLineRef.current = L.polyline(routeCoords, { 
          color: '#3b82f6', 
          weight: 5, 
          opacity: 0.8 
        }).addTo(map);

        const bounds = L.latLngBounds(routeCoords);
        map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        const map = miniMapInstanceRef.current;
        
        if (miniMarkersRef.current.client) {
          miniMarkersRef.current.client.setLatLng([productLat, productLng]);
          miniMarkersRef.current.client.setPopupContent(`<b>Seu Endereço</b><br>${deliveryAddress}`);
        }

        if (miniRouteLineRef.current) {
          miniRouteLineRef.current.setLatLngs(routeCoords);
        }

        const bounds = L.latLngBounds(routeCoords);
        map.fitBounds(bounds, { padding: [40, 40] });
      }

      setTimeout(() => {
        if (miniMapInstanceRef.current) {
          miniMapInstanceRef.current.invalidateSize();
        }
      }, 100);
    };

    setupMap();

    return () => {
      active = false;
    };
  }, [isAddressResolved, productLat, productLng, deliveryAddress, deliveryMethod]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove();
        miniMapInstanceRef.current = null;
        miniMarkersRef.current = {};
        miniRouteLineRef.current = null;
      }
    };
  }, []);

  // Render Product Checkout instead of Appointment payments if selectedProduct is set
  if (selectedProduct) {
    const frete = deliveryMethod === 'delivery' ? 10.00 : 0.00;
    const total = selectedProduct.price + frete;

    const handlePayProduct = (e: React.FormEvent) => {
      e.preventDefault();
      if (deliveryMethod === 'delivery' && !deliveryAddress.trim()) {
        alert('Por favor, informe o endereço para entrega.');
        return;
      }
      if (!prodPaymentMethod) {
        alert('Por favor, selecione uma forma de pagamento.');
        return;
      }
      setIsPayingProduct(true);
      setTimeout(() => {
        setIsPayingProduct(false);
        setShowProductSuccessModal(true);
      }, 1500);
    };

    const handleConfirmSuccess = async () => {
      if (deliveryMethod === 'delivery') {
        const currentDeliveries = JSON.parse(localStorage.getItem('laviola_deliveries') || '[]');
        const newDelivery = {
          id: 'deliv-' + Math.random().toString(36).substring(2, 9),
          client_id: currentUser.id,
          client_name: currentUser.name,
          client_address: deliveryAddress,
          client_lat: productLat,
          client_lng: productLng,
          driver_id: '', // Empty means needs dispatch
          driver_name: '',
          driver_lat: PETSHOP_COORDS.lat,
          driver_lng: PETSHOP_COORDS.lng,
          status: 'agendada',
          items: selectedProduct.name,
          scheduled_time: 'A ser despachada',
          created_at: new Date().toISOString()
        };
        currentDeliveries.unshift(newDelivery);
        localStorage.setItem('laviola_deliveries', JSON.stringify(currentDeliveries));
        
        await logAction(
          currentUser.email,
          currentUser.name,
          'Compra de Produto - Delivery',
          `Comprou "${selectedProduct.name}" com entrega para: "${deliveryAddress}".`
        );
      } else {
        await logAction(
          currentUser.email,
          currentUser.name,
          'Compra de Produto - Retirada',
          `Comprou "${selectedProduct.name}" para retirada na loja física.`
        );
      }

      setSelectedProduct(null);
      setShowProductSuccessModal(false);
      
      if (deliveryMethod === 'delivery') {
        setActiveSection('delivery');
      } else {
        setActiveSection('inicio');
      }
    };

    return (
      <section style={styles.contentSection} aria-labelledby="product-checkout-heading">
        <div style={styles.crudHeader}>
          <div>
            <h2 id="product-checkout-heading" style={styles.sectionTitle}>
              <CreditCard size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
              Finalizar Compra
              <div style={styles.sectionTitleBar} />
            </h2>
            <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
              Revise os detalhes do produto e escolha o método de entrega.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedProduct(null)}
            style={{
              ...styles.btnAcc(false),
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <X size={14} />
            Voltar
          </button>
        </div>

        <form onSubmit={handlePayProduct} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '24px' }}>
          {/* Product Box */}
          <div style={{
            padding: '16px 20px', borderRadius: '12px', border: `1.5px solid ${styles.borderColor}`,
            backgroundColor: styles.cardBackground || '#fff', boxShadow: styles.shadow
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <strong style={{ fontSize: '1.05rem', color: styles.textMain }}>{selectedProduct.name}</strong>
                <span style={{ display: 'block', fontSize: '0.8rem', color: styles.sidebarWidgetText?.color, marginTop: '4px' }}>
                  Quantidade: 1x · Pronta entrega
                </span>
              </div>
              <strong style={{ fontSize: '1.2rem', color: styles.primary }}>R$ {selectedProduct.price.toFixed(2)}</strong>
            </div>
          </div>

          {/* Delivery Method Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: styles.textMain }}>Método de Entrega</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flexWrap: 'wrap' }}>
              {/* Option Retirada */}
              <div 
                onClick={() => setDeliveryMethod('retirada')}
                style={{
                  padding: '16px', borderRadius: '12px', cursor: 'pointer',
                  border: `2px solid ${deliveryMethod === 'retirada' ? styles.primary : styles.borderColor}`,
                  backgroundColor: deliveryMethod === 'retirada' ? 'rgba(54,162,235,0.04)' : (styles.cardBackground || '#fff'),
                  transition: 'all 0.2s', boxShadow: styles.shadow
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: styles.primary }}>
                  <MapPin size={18} />
                  <strong style={{ fontSize: '0.95rem' }}>Retirada na Loja</strong>
                </div>
                <p style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color, marginTop: '6px', lineHeight: 1.4 }}>
                  Retire grátis na Rua Dr. Ibraim Hannas, 406 - Campo Grande.
                </p>
              </div>

              {/* Option Delivery */}
              <div 
                onClick={() => setDeliveryMethod('delivery')}
                style={{
                  padding: '16px', borderRadius: '12px', cursor: 'pointer',
                  border: `2px solid ${deliveryMethod === 'delivery' ? styles.primary : styles.borderColor}`,
                  backgroundColor: deliveryMethod === 'delivery' ? 'rgba(54,162,235,0.04)' : (styles.cardBackground || '#fff'),
                  transition: 'all 0.2s', boxShadow: styles.shadow
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'hsl(36, 95%, 50%)' }}>
                  <Truck size={18} />
                  <strong style={{ fontSize: '0.95rem' }}>Entrega em Casa (Delivery)</strong>
                </div>
                <p style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color, marginTop: '6px', lineHeight: 1.4 }}>
                  Receba no conforto do seu lar por uma taxa fixa de R$ 10,00.
                </p>
              </div>
            </div>
          </div>

          {/* Delivery Address Form Group (Only shows if Delivery selected) */}
          {deliveryMethod === 'delivery' && (
            <div style={{
              padding: '16px 20px', borderRadius: '12px', border: `1px solid ${styles.borderColor}`,
              backgroundColor: styles.cardBackground || '#fff', display: 'flex', flexDirection: 'column', gap: '12px',
              animation: 'fadeIn 0.3s'
            }}>
              <label style={{ fontSize: '0.88rem', fontWeight: 600, color: styles.textMain }}>
                Endereço para Entrega *
              </label>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
                <span style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color }}>
                  Digite o endereço de entrega (ex: "Rua Catolândia" ou "Rua Arthur Rios"):
                </span>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                  <input
                    type="text"
                    placeholder="Digite o endereço completo para buscar..."
                    value={deliveryAddress}
                    onChange={(e) => {
                      setDeliveryAddress(e.target.value);
                      setIsAddressResolved(false);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setShowSuggestions(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (suggestions.length > 0) {
                          handleSelectSuggestion(suggestions[0]);
                        } else {
                          handleResolveAddress();
                        }
                      }
                    }}
                    style={{ ...styles.formInput, paddingRight: '40px', width: '100%' }}
                    required
                  />
                  {isSearching && (
                    <div style={{ position: 'absolute', right: '40px', display: 'flex', alignItems: 'center', color: styles.primary }}>
                      <Loader2 size={16} className="spin-icon" style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleResolveAddress}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: styles.primary,
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Buscar endereço no mapa"
                  >
                    <Search size={18} />
                  </button>

                  {/* Suggestions Autocomplete Dropdown */}
                  {showSuggestions && deliveryAddress.trim() && !isAddressResolved && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: styles.cardBackground || '#fff',
                      border: `1.5px solid ${styles.borderColor}`,
                      borderRadius: '8px',
                      marginTop: '4px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      zIndex: 1000,
                      maxHeight: '220px',
                      overflowY: 'auto'
                    }}>
                      {suggestions.length > 0 ? (
                        suggestions.map((sug, idx, arr) => (
                          <div
                            key={idx}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectSuggestion(sug);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 14px',
                              cursor: 'pointer',
                              borderBottom: idx < arr.length - 1 ? `1px solid ${styles.borderColor}` : 'none',
                              transition: 'background-color 0.15s ease',
                              color: styles.textMain
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(54, 162, 235, 0.08)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <MapPin size={16} style={{ color: styles.primary, flexShrink: 0 }} />
                            <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {formatSuggestionName(sug.name, deliveryAddress)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleResolveAddress();
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 14px',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease',
                            color: styles.sidebarWidgetText?.color
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(54, 162, 235, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <Search size={16} style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                            {isSearching ? 'Buscando endereços...' : `Buscar "${deliveryAddress}" no mapa...`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '0.73rem', color: styles.sidebarWidgetText?.color }}>
                  Digite parte do nome da rua para visualizar sugestões e clique para selecioná-la.
                </span>
              </div>

              {/* Mini Map Container */}
              <div style={{
                display: isAddressResolved && deliveryAddress.trim() ? 'block' : 'none',
                marginTop: '10px'
              }}>
                <span style={{ fontSize: '0.8rem', color: 'hsl(142,60%,40%)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                  <CheckCircle2 size={14} /> Endereço localizado no mapa!
                </span>
                <div 
                  ref={miniMapContainerRef} 
                  style={{ 
                    height: '240px', 
                    width: '100%', 
                    borderRadius: '8px', 
                    border: `1.5px solid ${styles.borderColor}`, 
                    overflow: 'hidden',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)'
                  }} 
                />
              </div>
            </div>
          )}

          {/* Payment Method Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: styles.textMain }}>Forma de Pagamento</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div 
                onClick={() => setProdPaymentMethod('pix')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', cursor: 'pointer',
                  border: `2px solid ${prodPaymentMethod === 'pix' ? 'hsl(160,60%,40%)' : styles.borderColor}`,
                  background: prodPaymentMethod === 'pix' ? 'rgba(75,192,150,0.1)' : (styles.cardBackground || '#fff'),
                  transition: 'all 0.18s ease', position: 'relative'
                }}
              >
                <div style={{ color: 'hsl(160,60%,40%)' }}><QrCode size={24} /></div>
                <div>
                  <strong style={{ fontSize: '0.9rem', color: styles.textMain, display: 'block' }}>PIX</strong>
                  <span style={{ fontSize: '0.72rem', color: styles.sidebarWidgetText?.color }}>Liberação instantânea</span>
                </div>
                {prodPaymentMethod === 'pix' && (
                  <CheckCircle2 size={16} style={{ color: 'hsl(160,60%,40%)', marginLeft: 'auto' }} />
                )}
              </div>
            </div>
          </div>

          {/* Totals Summary */}
          <div style={{
            padding: '16px 20px', borderRadius: '12px', border: `1px solid ${styles.borderColor}`,
            backgroundColor: styles.background, display: 'flex', flexDirection: 'column', gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: styles.sidebarWidgetText?.color }}>
              <span>Subtotal</span>
              <span>R$ {selectedProduct.price.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: styles.sidebarWidgetText?.color }}>
              <span>Frete</span>
              <span>{frete === 0 ? 'Grátis' : `R$ ${frete.toFixed(2)}`}</span>
            </div>
            <div style={{ height: '1px', backgroundColor: styles.borderColor, margin: '4px 0' }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 700, color: styles.textMain }}>
              <span>Total a Pagar</span>
              <span style={{ color: styles.primary }}>R$ {total.toFixed(2)}</span>
            </div>
          </div>

          {/* Pay Button */}
          <button
            type="submit"
            disabled={isPayingProduct}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
              padding: '14px 24px', borderRadius: '10px', border: 'none',
              cursor: isPayingProduct ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 700,
              fontSize: '1rem', transition: 'all 0.2s',
              background: isPayingProduct 
                ? '#ccc' 
                : 'linear-gradient(135deg, hsl(210, 85%, 45%), hsl(210, 85%, 35%))',
              color: '#fff',
              boxShadow: isPayingProduct ? 'none' : '0 4px 14px rgba(54, 162, 235, 0.35)'
            }}
          >
            {isPayingProduct ? (
              <>
                <Loader2 size={18} className="spin-icon" style={{ animation: 'spin 1s linear infinite' }} />
                Processando Transação PIX...
              </>
            ) : (
              <>
                <ShieldCheck size={18} />
                Confirmar Pagamento Simulado via PIX
              </>
            )}
          </button>
        </form>

        {/* Modal Sucesso */}
        {showProductSuccessModal && (
          <div style={styles.modalOverlay}>
            <div style={{ ...styles.modalContent, maxWidth: '400px', textAlign: 'center', padding: '24px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(75,192,192,0.1)', color: 'hsl(142,60%,40%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <CheckCircle2 size={28} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: styles.textMain, margin: '0 0 10px' }}>
                Pagamento Confirmado!
              </h3>
              <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, lineHeight: 1.5, margin: '0 0 20px' }}>
                Recebemos o pagamento de <strong>R$ {total.toFixed(2)}</strong> via PIX para o produto <strong>{selectedProduct.name}</strong>.
                {deliveryMethod === 'delivery' 
                  ? ' Seu pedido foi encaminhado para despacho de entrega. Você pode acompanhá-lo em tempo real agora no painel de Delivery.' 
                  : ' O seu produto já está reservado! Retire-o no balcão da loja apresentando seu nome.'
                }
              </p>
              <button
                type="button"
                onClick={handleConfirmSuccess}
                style={{
                  ...styles.btnAcc(false),
                  width: '100%',
                  justifyContent: 'center',
                  background: styles.primary,
                  color: '#fff',
                  border: 'none',
                  padding: '10px',
                  fontWeight: 700
                }}
              >
                Concluir
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  const tabs = [
    { id: 'todos',      label: 'Todos os Serviços' },
    { id: 'agendados',  label: 'Próximos' },
    { id: 'concluidos', label: 'Realizados' },
  ] as const;

  return (
    <section style={styles.contentSection} aria-labelledby="pagamentos-heading">

      {/* ── Header ── */}
      <div style={styles.crudHeader}>
        <div>
          <h2 id="pagamentos-heading" style={styles.sectionTitle}>
            <CreditCard size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
            Meus Pagamentos
            <div style={styles.sectionTitleBar} />
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Selecione os serviços e avance para o pagamento de forma segura.
          </p>
        </div>
        <button
          onClick={fetchAppointments}
          disabled={isLoading}
          style={{
            ...styles.btnAcc(hoveredBtn === 'refresh'),
            display: 'flex', alignItems: 'center', gap: '6px',
            opacity: isLoading ? 0.7 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={() => setHoveredBtn('refresh')}
          onMouseLeave={() => setHoveredBtn(null)}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {/* ── Error ── */}
      {errorMsg && (
        <div style={{
          color: 'hsl(0,75%,55%)', fontSize: '0.85rem', margin: '15px 0',
          padding: '8px 12px', backgroundColor: 'hsl(0,75%,55%,0.08)',
          borderRadius: '6px', border: '1px solid hsl(0,75%,55%,0.25)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}

      {/* ── Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <div style={{
          background: styles.cardBackground || styles.background,
          border: `1px solid ${styles.borderColor}`,
          borderRadius: '12px', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '14px', boxShadow: styles.shadow,
        }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(54,162,235,0.1)', color: 'hsl(210,85%,45%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarDays size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>Total de Serviços</span>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: styles.textMain }}>
              {appointments.filter(a => a.status !== 'Cancelado').length}
            </strong>
          </div>
        </div>

        <div style={{
          background: styles.cardBackground || styles.background,
          border: `1px solid ${appointments.some(a => a.status === 'Concluído') ? 'rgba(75,192,192,0.3)' : styles.borderColor}`,
          borderRadius: '12px', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '14px', boxShadow: styles.shadow,
        }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(75,192,192,0.1)', color: 'hsl(142,60%,40%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>Realizados</span>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: 'hsl(142,60%,40%)' }}>
              {appointments.filter(a => a.status === 'Concluído').length}
            </strong>
          </div>
        </div>

        <div style={{
          background: styles.cardBackground || styles.background,
          border: `1px solid ${totalEstimado > 0 ? 'rgba(139,92,246,0.3)' : styles.borderColor}`,
          borderRadius: '12px', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '14px', boxShadow: styles.shadow,
        }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(139,92,246,0.1)', color: 'hsl(262,80%,58%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>Valor Total Est.</span>
            <strong style={{ display: 'block', fontSize: '1.3rem', color: 'hsl(262,80%,58%)' }}>
              R$ {totalEstimado.toFixed(2)}
            </strong>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '4px', marginTop: '28px', borderBottom: `1px solid ${styles.borderColor}` }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedIds(new Set()); setShowPaymentMethods(false); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: 600, fontSize: '0.88rem', padding: '8px 16px',
              color: activeTab === tab.id ? styles.primary : styles.sidebarWidgetText?.color,
              borderBottom: activeTab === tab.id ? `3px solid ${styles.primary}` : '3px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* ── Select All row ── */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', padding: '0 4px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onChange={toggleAll}
              style={{ width: '17px', height: '17px', accentColor: styles.primary, cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>
              Selecionar todos ({filtered.length})
            </span>
          </label>
          {selectedIds.size > 0 && (
            <span style={{ fontSize: '0.82rem', color: 'hsl(262,80%,58%)', fontWeight: 700 }}>
              {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''} · R$ {selectedTotal.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* ── Service List ── */}
      {isLoading && filtered.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText?.color, marginTop: '30px', textAlign: 'center' }}>Carregando serviços…</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', marginTop: '20px', border: `1px dashed ${styles.borderColor}`, borderRadius: '12px' }}>
          <PawPrint size={40} style={{ color: styles.secondary, margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
          <p style={{ color: styles.sidebarWidgetText?.color, fontWeight: 500 }}>Nenhum serviço encontrado para este filtro.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
          {filtered.map(app => {
            const st = statusConfig[app.status] || statusConfig['Agendado'];
            const valor = serviceValueMap[app.service_type] || 70;
            const isChecked = selectedIds.has(app.id);

            return (
              <label
                key={app.id}
                htmlFor={`chk-${app.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  background: isChecked
                    ? `linear-gradient(135deg, rgba(139,92,246,0.07), rgba(139,92,246,0.03))`
                    : (styles.cardBackground || styles.background),
                  border: `1.5px solid ${isChecked ? 'hsl(262,80%,58%)' : styles.borderColor}`,
                  borderRadius: '12px', padding: '14px 18px',
                  boxShadow: isChecked ? '0 0 0 3px rgba(139,92,246,0.12)' : styles.shadow,
                  cursor: 'pointer', transition: 'all 0.18s ease',
                  flexWrap: 'wrap',
                }}
              >
                {/* Checkbox */}
                <input
                  id={`chk-${app.id}`}
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleSelect(app.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '18px', height: '18px', accentColor: 'hsl(262,80%,58%)', cursor: 'pointer', flexShrink: 0 }}
                />

                {/* Ícone */}
                <div style={{
                  width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
                  background: isChecked ? 'rgba(139,92,246,0.12)' : 'rgba(54,162,235,0.08)',
                  color: isChecked ? 'hsl(262,80%,58%)' : styles.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CalendarDays size={18} />
                </div>

                {/* Info */}
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.97rem', color: styles.textMain }}>{app.service_type}</strong>
                    <span style={{
                      fontSize: '0.67rem', fontWeight: 700, padding: '2px 7px',
                      borderRadius: '20px', backgroundColor: st.bg, color: st.text,
                      border: `1px solid ${st.border}`, display: 'flex', alignItems: 'center', gap: '3px',
                    }}>
                      {st.icon} {st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color, marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <span>🐾 {app.pet_name}</span>
                    <span>📅 {formatDate(app.scheduled_at)}</span>
                  </div>
                </div>

                {/* Valor */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.7rem', color: styles.sidebarWidgetText?.color, display: 'block' }}>Valor est.</span>
                  <strong style={{ fontSize: '1.1rem', color: isChecked ? 'hsl(262,80%,58%)' : styles.textMain }}>
                    R$ {valor.toFixed(2)}
                  </strong>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {/* ── Barra de Total + Botão Seguir ── */}
      {selectedIds.size > 0 && (
        <div style={{
          marginTop: '20px',
          background: `linear-gradient(135deg, rgba(139,92,246,0.1), rgba(139,92,246,0.05))`,
          border: '1.5px solid rgba(139,92,246,0.3)',
          borderRadius: '14px',
          padding: '18px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '14px',
          boxShadow: '0 4px 20px rgba(139,92,246,0.15)',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: styles.sidebarWidgetText?.color, fontWeight: 600 }}>
              {selectedIds.size} serviço{selectedIds.size > 1 ? 's' : ''} selecionado{selectedIds.size > 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>Total estimado:</span>
              <strong style={{ fontSize: '1.5rem', color: 'hsl(262,80%,58%)' }}>R$ {selectedTotal.toFixed(2)}</strong>
            </div>
          </div>

          <button
            onClick={() => { setShowPaymentMethods(true); setSelectedMethod(null); }}
            onMouseEnter={() => setHoveredBtn('seguir')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 24px', borderRadius: '10px', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
              fontSize: '0.95rem', transition: 'all 0.2s',
              background: hoveredBtn === 'seguir'
                ? 'linear-gradient(135deg, hsl(262,80%,48%), hsl(262,80%,38%))'
                : 'linear-gradient(135deg, hsl(262,80%,58%), hsl(262,80%,48%))',
              color: '#fff',
              boxShadow: hoveredBtn === 'seguir'
                ? '0 6px 20px rgba(139,92,246,0.5)'
                : '0 4px 14px rgba(139,92,246,0.35)',
              transform: hoveredBtn === 'seguir' ? 'translateY(-1px)' : 'none',
            }}
          >
            Seguir para Pagamento <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* ── Formas de Pagamento (inline) ── */}
      {showPaymentMethods && selectedIds.size > 0 && (
        <div style={{
          marginTop: '16px',
          background: styles.cardBackground || styles.background,
          border: `1px solid ${styles.borderColor}`,
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: styles.shadow,
        }}>
          {/* Header da seção */}
          <div style={{
            padding: '16px 22px',
            borderBottom: `1px solid ${styles.borderColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={20} style={{ color: 'hsl(142,60%,40%)' }} />
              <div>
                <strong style={{ fontSize: '1rem', color: styles.textMain, display: 'block' }}>
                  Escolha a forma de pagamento
                </strong>
                <span style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color }}>
                  Total a pagar: <strong style={{ color: 'hsl(262,80%,58%)' }}>R$ {selectedTotal.toFixed(2)}</strong>
                </span>
              </div>
            </div>
            <button
              onClick={() => { setShowPaymentMethods(false); setSelectedMethod(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: styles.sidebarWidgetText?.color, padding: '4px' }}
              aria-label="Fechar formas de pagamento"
            >
              <X size={18} />
            </button>
          </div>

          {/* Grid de métodos */}
          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {paymentMethods.map(method => (
              <button
                key={method.id}
                onClick={() => method.available && setSelectedMethod(method.id)}
                disabled={!method.available}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  gap: '8px', padding: '16px', borderRadius: '12px', cursor: method.available ? 'pointer' : 'not-allowed',
                  border: `1.5px solid ${selectedMethod === method.id ? method.color : method.border}`,
                  background: selectedMethod === method.id
                    ? method.bg.replace('0.08', '0.18').replace('0.06', '0.14')
                    : method.bg,
                  boxShadow: selectedMethod === method.id ? `0 0 0 3px ${method.bg}` : 'none',
                  transition: 'all 0.18s ease', textAlign: 'left', fontFamily: 'inherit',
                  opacity: method.available ? 1 : 0.55,
                  position: 'relative',
                }}
              >
                {!method.available && (
                  <span style={{
                    position: 'absolute', top: '8px', right: '8px',
                    fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px',
                    borderRadius: '20px', background: 'rgba(120,120,120,0.12)',
                    color: styles.sidebarWidgetText?.color, textTransform: 'uppercase',
                  }}>
                    Em breve
                  </span>
                )}
                <div style={{ color: method.color }}>{method.icon}</div>
                <strong style={{ fontSize: '0.9rem', color: styles.textMain }}>{method.label}</strong>
                <span style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color, lineHeight: 1.4 }}>
                  {method.description}
                </span>
                {selectedMethod === method.id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <CheckCircle2 size={14} style={{ color: method.color }} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: method.color }}>Selecionado</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Aviso de segurança + ação */}
          <div style={{ padding: '14px 22px', borderTop: `1px solid ${styles.borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>
              <Lock size={13} /> Ambiente seguro · Dados criptografados
            </div>

            {selectedMethod === 'pix' ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 16px', borderRadius: '10px',
                background: 'rgba(75,192,150,0.08)', border: '1px solid rgba(75,192,150,0.3)',
              }}>
                <QrCode size={18} style={{ color: 'hsl(160,60%,40%)' }} />
                <div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'hsl(160,60%,40%)', display: 'block' }}>
                    PIX — em configuração
                  </span>
                  <span style={{ fontSize: '0.72rem', color: styles.sidebarWidgetText?.color }}>
                    Entre em contato: <strong>(21) 97128-2945</strong>
                  </span>
                </div>
              </div>
            ) : selectedMethod ? (
              <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
                Esta forma de pagamento estará disponível em breve.
              </span>
            ) : (
              <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
                Selecione uma forma de pagamento acima.
              </span>
            )}
          </div>
        </div>
      )}

    </section>
  );
};
