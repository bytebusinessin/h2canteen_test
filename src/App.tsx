/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import {
  Store, Bell, ShoppingBag, MapPin, CheckCircle,
  Search, Plus, Phone, Clock, Utensils, X, Edit2, ArrowLeft, Volume2, VolumeX,
  ShoppingCart, Trash2, Power, Wifi,
  ChevronRight, Building2, Info, BarChart2, Package
} from 'lucide-react';
import { ScreenType, Order, MenuItem, OrderStatus, KitchenStats } from './types';
import { INITIAL_ORDERS } from './initialData';

import { db, auth } from './firebase';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// ── Types ──────────────────────────────────────────────────────────────────
type DateFilter = 'today' | 'yesterday' | 'month' | 'lifetime';
type HistoryDateFilter = 'all' | '7days' | '30days';
type HistoryStatusFilter = 'all' | OrderStatus;
type MenuType = 'online' | 'pos';

interface StoreInfo {
  storeName: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  gstin: string;
  gstRate: number;
  gstEnabled: boolean;
  gstType: string;
  currency: string;
  openingTime: string;
  closingTime: string;
  shifts: { name: string; startTime: string; endTime: string }[];
}

// ── Normalisers ────────────────────────────────────────────────────────────
function normaliseProduct(id: string, data: any): MenuItem {
  return {
    id,
    name: data.name ?? '',
    price: data.price ?? data.basePrice ?? 0,
    category: data.category ?? data.categoryId ?? '',
    inStock: data.inStock ?? data.isAvailable ?? data.available ?? true,
    image: data.image ?? data.imageURL ?? data.imageUrl ?? '',
    isPopular: data.isPopular ?? data.popular ?? false,
  };
}

function normaliseStatus(raw: any): OrderStatus {
  const s = String(raw ?? '').toUpperCase();
  if (['NEW', 'PENDING', 'PLACED', 'CONFIRMED'].includes(s)) return 'NEW';
  if (['PREPARING', 'ACCEPTED', 'PROCESSING', 'IN_PROGRESS'].includes(s)) return 'PREPARING';
  if (['READY', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DISPATCHED'].includes(s)) return 'READY';
  if (['COMPLETED', 'DELIVERED', 'DONE', 'PAID'].includes(s)) return 'COMPLETED';
  if (['CANCELLED', 'CANCELED', 'REJECTED', 'DECLINED'].includes(s)) return 'CANCELLED';
  return 'NEW';
}

function normaliseOrder(id: string, data: any): Order {
  let createdAt = '';
  // Cover every field name used by Cashfree webhooks, POS, and the web panel
  const raw = data.createdAt ?? data.created_at ?? data.orderDate ?? data.order_date
    ?? data.timestamp ?? data.orderTime ?? data.placedAt ?? data.date ?? data.created;
  if (raw?.toDate) createdAt = raw.toDate().toISOString();
  else if (typeof raw === 'string' && raw) createdAt = raw;
  else if (typeof raw === 'number' && raw > 0) createdAt = new Date(raw).toISOString();
  else createdAt = new Date().toISOString();
  // Guard against invalid dates — fall back to now so the order still appears
  if (isNaN(new Date(createdAt).getTime())) createdAt = new Date().toISOString();

  const rawItems = data.items ?? data.orderItems ?? data.cart ?? [];
  const items = rawItems.map((item: any, i: number) => ({
    id: item.id ?? item.productId ?? String(i),
    name: item.name ?? item.productName ?? item.title ?? '',
    category: item.category ?? '',
    price: item.price ?? item.unitPrice ?? 0,
    qty: item.qty ?? item.quantity ?? item.count ?? 1,
    image: item.image ?? item.imageURL ?? item.imageUrl ?? '',
  }));

  const subtotal = data.subtotal ?? data.subTotal ?? data.itemTotal ?? 0;
  // dukanFee + deliveryFee are the client's "taxes" equivalents
  const taxes = data.taxes ?? data.tax ?? data.gst ?? ((data.dukanFee ?? 0) + (data.deliveryFee ?? 0));
  const total = data.grandTotal ?? data.total ?? data.totalAmount ?? data.amount ?? (subtotal + taxes);

  // deliveryAddress can be an object {hostelNumber, roomNumber, fullAddress, name, mobile} or a string
  const da = data.deliveryAddress;
  const daStr = da && typeof da === 'object'
    ? (da.fullAddress || [da.hostelNumber, da.roomNumber ? `Room ${da.roomNumber}` : ''].filter(Boolean).join(', '))
    : (typeof da === 'string' ? da : '');

  return {
    id,
    orderId: data.orderId ?? data.order_id ?? undefined,
    customerName: data.customerName ?? data.customer?.name ?? da?.name ?? data.userName ?? data.name ?? 'Customer',
    customerPhone: data.customerPhone ?? data.customer?.phone ?? da?.mobile ?? data.phone ?? data.mobile ?? '',
    customerAddress: data.customerAddress ?? data.customer?.address ?? data.address ?? daStr,
    items,
    subtotal,
    taxes,
    total,
    status: normaliseStatus(data.status ?? data.orderStatus),
    type: (data.type ?? data.orderType ?? 'ONLINE').toString().toUpperCase() as any,
    time: data.time ?? data.displayTime ?? '',
    createdAt,
    note: data.note ?? data.instructions ?? data.specialInstructions ?? '',
    checkedItems: data.checkedItems ?? [],
    rawData: data,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ── Component ──────────────────────────────────────────────────────────────
export default function App() {
  // ── Data state ──
  const [orders, setOrders] = useState<Order[]>([]);
  const [onlineItems, setOnlineItems] = useState<MenuItem[]>([]);
  const [posItems, setPosItems] = useState<MenuItem[]>([]);
  const [storeOpen, setStoreOpen] = useState<boolean>(true);
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [menuType, setMenuType] = useState<MenuType>('online');
  const [storeInfo, setStoreInfo] = useState<StoreInfo>({
    storeName: 'Aromas Dhaba',
    phone: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    gstin: '',
    gstRate: 0,
    gstEnabled: false,
    gstType: '',
    currency: 'INR',
    openingTime: '',
    closingTime: '',
    shifts: [],
  });
  const [vendorEmail, setVendorEmail] = useState('');

  // ── UI state ──
  const [activeScreen, setActiveScreen] = useState<ScreenType>(() => (localStorage.getItem('aromas_screen') as ScreenType) || 'dashboard');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => localStorage.getItem('aromas_selected_order_id') || null);
  const [ordersTab, setOrdersTab] = useState<OrderStatus>(() => (localStorage.getItem('aromas_orders_tab') as OrderStatus) || 'NEW');
  const [ordersTopTab, setOrdersTopTab] = useState<'live' | 'cancelled'>('live');
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [dashboardView, setDashboardView] = useState<'online' | 'pos'>('online');
  const [analyticsDoc, setAnalyticsDoc] = useState<any>(null);

  // History filters
  const [historyDateFilter, setHistoryDateFilter] = useState<HistoryDateFilter>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>('all');
  const [historySourceFilter] = useState<'all' | 'ONLINE' | 'POS'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyBulkMode, setHistoryBulkMode] = useState(false);
  const [historySelected, setHistorySelected] = useState<Set<string>>(new Set());
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [menuSearchOpen, setMenuSearchOpen] = useState(false);
  const [showStoreConfirm, setShowStoreConfirm] = useState(false);
  const [editingStoreInfo, setEditingStoreInfo] = useState(false);
  const [editDraft, setEditDraft] = useState<StoreInfo>(storeInfo);

  const [logoError, setLogoError] = useState(false);

  // Menu state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [editPriceValue, setEditPriceValue] = useState<number>(0);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemImage, setNewItemImage] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Global state
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);
  const knownOrderIds = useRef<Set<string>>(new Set());

  // ── Firebase Auth — sign in anonymously so Firestore rules (isSignedIn) pass ──
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthReady(true);
      } else {
        signInAnonymously(auth).catch(() => {
          // If anonymous auth fails (e.g. not enabled), still allow reads
          setAuthReady(true);
        });
      }
    });
    return () => unsub();
  }, []);

  // ── Persist nav state ──
  useEffect(() => { localStorage.setItem('aromas_screen', activeScreen); }, [activeScreen]);
  useEffect(() => {
    if (selectedOrderId) localStorage.setItem('aromas_selected_order_id', selectedOrderId);
    else localStorage.removeItem('aromas_selected_order_id');
  }, [selectedOrderId]);
  useEffect(() => { localStorage.setItem('aromas_orders_tab', ordersTab); }, [ordersTab]);

  // ── Firebase listeners ──
  useEffect(() => {
    if (!authReady) return;
    const unsub = onSnapshot(
      collection(db, 'orders'),
      (snapshot) => {
        setOrders(
          snapshot.docs
            .map(d => normaliseOrder(d.id, d.data()))
            .filter(o => {
              if (o.type === 'ONLINE') {
                const ps = (o.rawData?.payment_status ?? '').toUpperCase();
                return ps === 'SUCCESS';
              }
              return true;
            })
        );
      },
      (err) => { console.warn('[orders] snapshot error:', err.code); }
    );
    return () => unsub();
  }, [authReady]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      setOnlineItems(snapshot.docs.map(d => normaliseProduct(d.id, d.data())));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'posProducts'), (snapshot) => {
      setPosItems(snapshot.docs.map(d => normaliseProduct(d.id, d.data())));
    });
    return () => unsub();
  }, []);

  // Store settings — reads from storeSettings (shared with Windows app) + fallback to settings/store
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'storeSettings'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (typeof d.isOpen === 'boolean') setStoreOpen(d.isOpen);
        const shiftsMap = d.shifts ?? {};
        const shifts = Object.values(shiftsMap)
          .filter((s: any) => s && s.name)
          .map((s: any) => ({ name: s.name ?? '', startTime: s.startTime ?? '', endTime: s.endTime ?? '' }))
          .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
        setStoreInfo({
          storeName: d.storeName ?? 'Aromas Dhaba',
          phone: d.vendorPhone ?? d.phone ?? '',
          address: [d.streetArea, d.city].filter(Boolean).join(', '),
          city: d.city ?? '',
          state: d.state ?? '',
          pinCode: d.pinCode ?? '',
          gstin: d.gstin ?? '',
          gstRate: d.gstPercentage ?? d.gstRate ?? 0,
          gstEnabled: d.gstEnabled ?? false,
          gstType: d.gstType ?? '',
          currency: d.currency ?? 'INR',
          openingTime: d.openingTime ?? d.businessHours?.openingTime ?? '',
          closingTime: d.closingTime ?? d.businessHours?.closingTime ?? '',
          shifts,
        });
        setStoreLoaded(true);
      }
    });
    return () => unsub();
  }, []);

  // Vendor email — read from vendors collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'vendors'), (snap) => {
      if (!snap.empty) {
        const email = snap.docs[0].data().email ?? '';
        setVendorEmail(email);
      }
    });
    return () => unsub();
  }, []);

  // Fallback: legacy settings/store doc
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'store'), (snap) => {
      if (snap.exists() && typeof snap.data().isOpen === 'boolean') {
        setStoreOpen(snap.data().isOpen);
      }
      setStoreLoaded(true);
    });
    return () => unsub();
  }, []);

  // POS analytics — reads the first vendor document in the analytics collection
  useEffect(() => {
    if (!authReady) return;
    const unsub = onSnapshot(
      collection(db, 'analytics'),
      (snapshot) => {
        if (!snapshot.empty) setAnalyticsDoc(snapshot.docs[0].data());
      },
      (err) => { console.warn('[analytics] snapshot error:', err.code); }
    );
    return () => unsub();
  }, [authReady]);

  const toggleStoreOpen = async () => {
    const next = !storeOpen;
    setStoreOpen(next);
    await Promise.all([
      setDoc(doc(db, 'settings', 'storeSettings'), { isOpen: next }, { merge: true }),
      setDoc(doc(db, 'settings', 'store'), { isOpen: next }, { merge: true }),
    ]);
  };

  // ── Derived ──
  const activeMenuItems = menuType === 'online' ? onlineItems : posItems;
  const activeCollection = menuType === 'online' ? 'products' : 'posProducts';
  const menuCategories = ['All', ...Array.from(new Set(activeMenuItems.map(i => i.category).filter(Boolean)))];


  // ── Sound — iPhone-style message ding ──
  const playAlertSound = useCallback((force = false) => {
    if (!force && !soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const t = ctx.currentTime;
      // Two-tone bell: primary ding + soft harmonic
      [[1318.5, 0.28], [1046.5, 0.14]].forEach(([freq, vol]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        osc.start(t); osc.stop(t + 0.9);
      });
      // Second softer ding at +0.18s (iPhone double-ping feel)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1567.98, t + 0.18);
      gain2.gain.setValueAtTime(0.18, t + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      osc2.start(t + 0.18); osc2.stop(t + 0.85);
    } catch (_) {}
  }, [soundEnabled]);

  // ── New order detection ──
  useEffect(() => {
    if (orders.length === 0) return;
    const isFirstLoad = knownOrderIds.current.size === 0;
    const incoming: Order[] = [];
    orders.forEach(o => {
      if (!knownOrderIds.current.has(o.id)) {
        knownOrderIds.current.add(o.id);
        if (!isFirstLoad && o.status === 'NEW') incoming.push(o);
      }
    });
    if (incoming.length > 0) {
      playAlertSound();
      incoming.forEach(o => {
        const label = o.orderId || o.id;
        const items = o.items.length === 1 ? o.items[0].name : `${o.items.length} items`;
        setNotifications(prev => [`New order ${label} — ${items} · ₹${o.total}`, ...prev]);
      });
    }
  }, [orders, playAlertSound]);

  // ── Stats ──
  const getDateBounds = (filter: DateFilter) => {
    const now = new Date();
    const s = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const e = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    if (filter === 'today') return { start: s(now), end: e(now) };
    if (filter === 'yesterday') { const y = new Date(now); y.setDate(now.getDate() - 1); return { start: s(y), end: e(y) }; }
    if (filter === 'lifetime') return { start: new Date(0), end: new Date(32503680000000) };
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: e(now) };
  };

  const getFilteredStats = (filter: DateFilter, sourceFilter: 'ALL' | 'ONLINE' | 'POS' = 'ALL') => {
    const { start, end } = getDateBounds(filter);
    const filtered = orders.filter(o => {
      const t = new Date(o.createdAt).getTime();
      if (t < start.getTime() || t > end.getTime() || o.status === 'CANCELLED') return false;
      if (sourceFilter === 'ONLINE' && o.type !== 'ONLINE') return false;
      if (sourceFilter === 'POS' && o.type === 'ONLINE') return false;
      return true;
    });
    const revenue = filtered.reduce((s, o) => s + (o.total ?? 0), 0);
    const avgOrderValue = filtered.length > 0 ? Math.round(revenue / filtered.length) : 0;

    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs);
    const prevEnd = new Date(end.getTime() - periodMs);
    const prevFiltered = orders.filter(o => {
      const t = new Date(o.createdAt).getTime();
      if (t < prevStart.getTime() || t > prevEnd.getTime() || o.status === 'CANCELLED') return false;
      if (sourceFilter === 'ONLINE' && o.type !== 'ONLINE') return false;
      if (sourceFilter === 'POS' && o.type === 'ONLINE') return false;
      return true;
    });
    const prevRevenue = prevFiltered.reduce((s, o) => s + (o.total ?? 0), 0);
    const revenueTrend = prevRevenue > 0
      ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100)
      : null;

    return { orderCount: filtered.length, revenue: Math.round(revenue), avgOrderValue, revenueTrend };
  };

  // ── POS Analytics helpers ──
  // Windows app writes: analytics/{uid} → { pos_orders_today, pos_revenue_today, hourly_today: {"0":{orders,revenue},...}, sync_date: "YYYY-MM-DD" }
  const todayISO = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();

  const getPOSStats = (filter: DateFilter) => {
    // Only "today" has live data from the Windows sync; everything else falls back to Firestore orders
    if (filter === 'today' && analyticsDoc && analyticsDoc.sync_date === todayISO) {
      const orderCount = analyticsDoc.pos_orders_today || 0;
      const revenue = Math.round(analyticsDoc.pos_revenue_today || 0);
      const avgOrderValue = orderCount > 0 ? Math.round(revenue / orderCount) : 0;
      return { orderCount, revenue, avgOrderValue, revenueTrend: null };
    }
    // Fallback: compute from Firestore orders with type !== ONLINE (POS/takeaway)
    return getFilteredStats(filter, 'POS');
  };

  const getTodayHourlyPOS = () => {
    if (!analyticsDoc || analyticsDoc.sync_date !== todayISO) return [];
    const hourly: Record<string, any> = analyticsDoc.hourly_today ?? {};
    return Object.entries(hourly)
      .map(([hour, data]: [string, any]) => ({
        hour: Number(hour),
        orders: data.orders || 0,
        revenue: data.revenue || 0,
      }))
      .sort((a, b) => a.hour - b.hour);
  };

  const getTopItems = (filter: DateFilter, sourceFilter: 'ALL' | 'ONLINE' | 'POS' = 'ALL') => {
    const { start, end } = getDateBounds(filter);
    const filtered = orders.filter(o => {
      const t = new Date(o.createdAt).getTime();
      if (t < start.getTime() || t > end.getTime() || o.status === 'CANCELLED') return false;
      if (sourceFilter === 'ONLINE' && o.type !== 'ONLINE') return false;
      if (sourceFilter === 'POS' && o.type === 'ONLINE') return false;
      return true;
    });
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    filtered.forEach(order => {
      order.items.forEach(item => {
        if (!map[item.name]) map[item.name] = { name: item.name, qty: 0, revenue: 0 };
        map[item.name].qty += item.qty;
        map[item.name].revenue += item.price * item.qty;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
  };

  const filteredStats = dashboardView === 'online'
    ? getFilteredStats(dateFilter, 'ONLINE')
    : getPOSStats(dateFilter);
  const filterLabels: Record<DateFilter, string> = { today: 'Today', yesterday: 'Yesterday', month: 'This Month', lifetime: 'Life Time' };

  const getStats = (): KitchenStats => {
    const completedCount = orders.filter(o => o.status === 'COMPLETED').length;
    const todayRevenue = Math.round(orders.filter(o => o.status === 'COMPLETED').reduce((s, o) => s + o.total, 0));
    return {
      activeCount: orders.filter(o => o.status === 'PREPARING' || o.status === 'NEW').length,
      pendingCount: orders.filter(o => o.status === 'NEW').length,
      completedCount,
      queueCount: orders.filter(o => o.status === 'PREPARING').length,
      todayRevenue,
    };
  };
  const stats = getStats();

  // ── History filters ──
  const getHistoryDateBounds = (filter: HistoryDateFilter) => {
    const now = new Date();
    const s = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const e = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    if (filter === 'all') return { start: new Date(0), end: new Date(32503680000000) }; // epoch → year 3000
    if (filter === '7days') { const d = new Date(now); d.setDate(now.getDate() - 6); return { start: s(d), end: e(now) }; }
    const d = new Date(now); d.setDate(now.getDate() - 29);
    return { start: s(d), end: e(now) };
  };

  const getHistoryOrders = () => {
    const { start, end } = getHistoryDateBounds(historyDateFilter);
    return orders
      .filter(o => {
        const t = new Date(o.createdAt).getTime();
        if (t < start.getTime() || t > end.getTime()) return false;
        if (historyStatusFilter !== 'all' && o.status !== historyStatusFilter) return false;
        if (historySourceFilter === 'ONLINE' && o.type !== 'ONLINE') return false;
        if (historySourceFilter === 'POS' && o.type === 'ONLINE') return false;
        if (historySearch) {
          const q = historySearch.toLowerCase();
          if (!o.id.toLowerCase().includes(q) && !o.customerName.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const historyOrders = getHistoryOrders();
  const historyRevenue = historyOrders
    .filter(o => o.status !== 'CANCELLED')
    .reduce((s, o) => s + o.total, 0);

  // ── Order actions ──
  const handleBulkDeliver = async () => {
    const ids = [...historySelected];
    await Promise.all(ids.map(id => updateDoc(doc(db, 'orders', id), { status: 'COMPLETED' })));
    setHistorySelected(new Set());
    setHistoryBulkMode(false);
  };

  // ── Menu actions ──
  const getFilteredMenuItems = () => {
    const base = activeMenuItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (categoryFilter === 'All') return base;
    return base.filter(i => i.category === categoryFilter);
  };

  const handleToggleStock = async (id: string) => {
    const item = activeMenuItems.find(i => i.id === id);
    if (!item) return;
    const next = !item.inStock;
    await updateDoc(doc(db, activeCollection, id), { inStock: next, isAvailable: next });
  };

  const handleDeleteMenuItem = async (id: string) => {
    await deleteDoc(doc(db, activeCollection, id));
    setConfirmDeleteId(null);
  };

  const handleSavePrice = async () => {
    if (!editingMenuItem) return;
    await updateDoc(doc(db, activeCollection, editingMenuItem.id), { price: editPriceValue });
    setEditingMenuItem(null);
  };

  const handleAddNewItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) { alert('Please enter name and price.'); return; }
    const id = `item_${Date.now()}`;
    await setDoc(doc(db, activeCollection, id), {
      name: newItemName,
      price: Number(newItemPrice),
      category: newItemCategory || 'General',
      inStock: true, isAvailable: true, is_available: true, available: true,
      imageURL: newItemImage || '', image: newItemImage || '', image_url: newItemImage || '',
      createdAt: new Date().toISOString(),
    });
    setNewItemName(''); setNewItemPrice(''); setNewItemCategory(''); setNewItemImage('');
    setIsAddingItem(false);
  };

  const handleSaveStoreInfo = async () => {
    try {
      await setDoc(doc(db, 'settings', 'storeSettings'), {
        storeName: editDraft.storeName,
        vendorPhone: editDraft.phone,
        city: editDraft.city,
        state: editDraft.state,
        pinCode: editDraft.pinCode,
        gstin: editDraft.gstin,
        gstEnabled: editDraft.gstEnabled,
        gstPercentage: editDraft.gstRate,
        gstType: editDraft.gstType,
        currency: editDraft.currency,
        openingTime: editDraft.openingTime,
        closingTime: editDraft.closingTime,
      }, { merge: true });
      setEditingStoreInfo(false);
    } catch (e) { console.error(e); }
  };

  const handleResetData = () => {
    if (window.confirm('Reset kitchen dashboard?')) {
      setOrders(INITIAL_ORDERS);
      setActiveScreen('dashboard');
      setSelectedOrderId(null);
      setOrdersTab('NEW');
      setNotifications(['Dashboard reset.']);
    }
  };


  // ── Status badge helper ──
  const statusBadge = (status: OrderStatus) => {
    const map: Record<OrderStatus, { label: string; cls: string }> = {
      NEW:       { label: 'New',       cls: 'bg-[#fff3ed] text-[#ff6b00] border border-[#ff6b00]/20' },
      PREPARING: { label: 'Preparing', cls: 'bg-[#fdf3e7] text-[#a04100] border border-[#a04100]/20' },
      READY:     { label: 'Ready',     cls: 'bg-[#edf4ff] text-blue-600 border border-blue-200' },
      COMPLETED: { label: 'Completed', cls: 'bg-[#edfaf0] text-green-700 border border-green-200' },
      CANCELLED: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500 border border-gray-200' },
    };
    const b = map[status] ?? map.NEW;
    return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${b.cls}`}>{b.label}</span>;
  };

  const FALLBACK_IMG = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';

  // ── Navigate to order ──
  const goToOrder = (id: string) => {
    setSelectedOrderId(id);
    setActiveScreen('order-details');
  };

  const goBack = () => {
    setActiveScreen('orders');
    setSelectedOrderId(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#fdf8fd] text-[#1c1b1f] font-sans min-h-screen relative pb-24 md:pb-28">

      {/* ── TOP HEADER ── */}
      <header className="bg-white sticky top-0 border-b border-[#e2bfb0]/30 shadow-sm z-40">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            {activeScreen === 'order-details' ? (
              <button onClick={goBack} className="p-1.5 hover:bg-[#f1ecf2] rounded-full active:scale-95 text-[#a04100] mr-1">
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : logoError
                ? <Store className="w-6 h-12 text-[#a04100]" />
                : <img src="/logo.png" alt="logo" className="h-10 w-auto object-contain" onError={() => setLogoError(true)} />
            }
            {activeScreen === 'order-details' && (
              <h1 className="text-base font-bold text-[#a04100] tracking-tight">
                Order {orders.find(o => o.id === selectedOrderId)?.orderId || selectedOrderId}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2">
            {(activeScreen === 'orders' || activeScreen === 'order-details') && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-[#cee5ff] text-[#001d32] border border-[#96ccff] rounded-full text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 text-[#004a75]" /><span>AVG 12M</span>
              </div>
            )}
            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)} className="p-1.5 relative hover:bg-[#f1ecf2] rounded-full active:scale-95 text-[#5a4136]">
                <Bell className="w-5 h-5" />
                {notifications.length > 0 && <span className="absolute -top-0.5 -right-0.5 bg-[#ba1a1a] text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{notifications.length}</span>}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-[#e2bfb0]/40 rounded-xl shadow-xl z-50 overflow-hidden text-xs">
                  <div className="p-2.5 bg-[#f7f2f8] border-b border-[#e2bfb0]/20 flex justify-between items-center font-bold text-[#5a4136]">
                    <span>Notifications</span>
                    <button onClick={() => setNotifications([])} className="text-[#a04100] underline">Clear</button>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                    {notifications.length === 0
                      ? <div className="p-4 text-center text-gray-500">No alerts</div>
                      : notifications.map((n, i) => <div key={i} className="p-2.5 text-[11px] hover:bg-[#fdf8fd]">{n}</div>)}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setSoundEnabled(!soundEnabled)} className="p-1.5 hover:bg-[#f1ecf2] rounded-full hidden sm:block text-[#5a4136]">
              {soundEnabled ? <Volume2 className="w-5 h-5 text-green-600" /> : <VolumeX className="w-5 h-5 text-gray-400" />}
            </button>
          </div>
        </div>
      </header>

      {/* ── STORE CLOSED BANNER ── */}
      {!storeOpen && storeLoaded && (
        <div className="bg-gray-800 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-bold z-30">
          <Power className="w-3.5 h-3.5 text-gray-400" />
          <span>Store is closed — new orders paused. <span className="underline cursor-pointer" onClick={toggleStoreOpen}>Tap to reopen</span></span>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 pt-5 flex flex-col gap-5">

        {/* ══════════════════════════════════════════════
            DASHBOARD
        ══════════════════════════════════════════════ */}
        {activeScreen === 'dashboard' && (
          <div className="flex flex-col gap-4">

            {/* Share store link card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-sm font-bold text-[#1c1b1f] mb-0.5">Share link on WhatsApp</p>
              <p className="text-xs text-gray-400 mb-3">Your customers can visit your online store and place orders from this link.</p>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-semibold text-[#a04100] truncate underline underline-offset-2">aromadhaba.in</span>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent('Order from Aromas IIM Mumbai: https://aromadhaba.in')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-xl active:scale-95 flex-shrink-0"
                >
                  <Wifi className="w-3.5 h-3.5" />Share
                </a>
              </div>
            </div>

            {/* Online / POS tabs */}
            <div className="flex border-b border-gray-200 -mx-4 px-4">
              <button onClick={() => setDashboardView('online')} className={`py-2.5 mr-6 text-sm font-bold border-b-2 transition-all ${dashboardView === 'online' ? 'border-[#a04100] text-[#a04100]' : 'border-transparent text-gray-400'}`}>Online</button>
              <button onClick={() => setDashboardView('pos')} className={`py-2.5 mr-6 text-sm font-bold border-b-2 transition-all ${dashboardView === 'pos' ? 'border-[#a04100] text-[#a04100]' : 'border-transparent text-gray-400'}`}>POS</button>
            </div>

            {/* Overview + date filter */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1c1b1f]">Overview</h2>
              <div className="flex gap-1">
                {(['lifetime', 'today', 'yesterday', 'month'] as DateFilter[]).map(f => (
                  <button key={f} onClick={() => setDateFilter(f)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all whitespace-nowrap ${dateFilter === f ? 'bg-[#a04100] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
                    {f === 'lifetime' ? 'Life Time' : f === 'today' ? 'Today' : f === 'yesterday' ? 'Yest.' : 'Month'}
                  </button>
                ))}
              </div>
            </div>

            {/* 2×2 stats — all numbers in plain black */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-3">ORDERS</p>
                <p className="text-3xl font-black text-[#1c1b1f]">{filteredStats.orderCount}</p>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-3">REVENUE</p>
                <p className="text-3xl font-black text-[#1c1b1f]">₹{filteredStats.revenue.toLocaleString('en-IN')}</p>
                {filteredStats.revenueTrend !== null && (
                  <p className={`text-[10px] font-bold mt-1 ${filteredStats.revenueTrend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {filteredStats.revenueTrend >= 0 ? '+' : ''}{filteredStats.revenueTrend}% vs prev
                  </p>
                )}
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-3">AVG ORDER</p>
                <p className="text-3xl font-black text-[#1c1b1f]">₹{filteredStats.avgOrderValue.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-3">COMPLETED</p>
                <p className="text-3xl font-black text-[#1c1b1f]">
                  {dashboardView === 'online'
                    ? orders.filter(o => o.status === 'COMPLETED' && o.type === 'ONLINE').length
                    : orders.filter(o => o.status === 'COMPLETED' && o.type !== 'ONLINE').length}
                </p>
              </div>
            </div>

            {/* POS: hourly bar chart (today only) */}
            {dashboardView === 'pos' && dateFilter === 'today' && (() => {
              const hourlyData = getTodayHourlyPOS();
              if (hourlyData.length === 0) return (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center">
                  <p className="text-xs text-gray-400">No POS hourly data for today yet</p>
                  <p className="text-[10px] text-gray-400 mt-1">Syncs every 60s from the Windows POS</p>
                </div>
              );
              const maxRevenue = Math.max(...hourlyData.map(h => h.revenue), 1);
              return (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-[#1c1b1f]">Today's Hourly Sales</h3>
                    <span className="text-[9px] text-gray-400 uppercase tracking-wider">Live · 60s sync</span>
                  </div>
                  <div className="flex items-end gap-1.5 h-24">
                    {hourlyData.map(h => (
                      <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                        <span className="text-[7px] text-[#a04100] font-black">{h.orders > 0 ? h.orders : ''}</span>
                        <div className="w-full bg-[#a04100] rounded-t-sm" style={{ height: `${Math.max((h.revenue / maxRevenue) * 64, h.revenue > 0 ? 3 : 0)}px` }} />
                        <span className="text-[6px] text-gray-400">{h.hour}h</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-[10px] text-gray-400">
                    <span>{hourlyData.reduce((s, h) => s + h.orders, 0)} orders</span>
                    <span>₹{hourlyData.reduce((s, h) => s + h.revenue, 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              );
            })()}

            {/* Active Orders — online only */}
            {dashboardView === 'online' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#1c1b1f]">Active Orders</h3>
                <button onClick={() => { setActiveScreen('orders'); setOrdersTopTab('live'); setOrdersTab('NEW'); }} className="text-xs font-bold text-[#a04100] flex items-center gap-0.5">
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              {(() => {
                const activeOrders = orders.filter(o =>
                  (o.status === 'NEW' || o.status === 'PREPARING') && o.type === 'ONLINE'
                );
                return activeOrders.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center">
                    <p className="text-xs text-gray-400">No active orders right now</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {activeOrders.slice(0, 4).map(order => (
                      <div key={order.id} onClick={() => goToOrder(order.id)} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3 cursor-pointer active:bg-gray-50">
                        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                          <img className="w-full h-full object-cover" src={order.items[0]?.image || FALLBACK_IMG} alt="" onError={e => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs text-[#1c1b1f]">Order {order.orderId || order.id}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{order.items.length} Item{order.items.length !== 1 ? 's' : ''} • {formatTime(order.createdAt)}</p>
                        </div>
                        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                          <p className="font-black text-sm text-[#a04100]">₹{order.total}</p>
                          {statusBadge(order.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            )}

            {/* Top items (online only) */}
            {dashboardView === 'online' && getTopItems(dateFilter, 'ONLINE').length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-[#1c1b1f] mb-3">Top Items</h3>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  {getTopItems(dateFilter, 'ONLINE').map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-[#a04100]/10 text-[#a04100] flex items-center justify-center text-[9px] font-black">{idx + 1}</span>
                        <span className="text-xs font-medium text-[#1c1b1f]">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-gray-400">{item.qty} sold</span>
                        <span className="text-xs font-bold text-[#1c1b1f]">₹{item.revenue.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ORDERS
        ══════════════════════════════════════════════ */}
        {activeScreen === 'orders' && (() => {
          const cancelledOrders = orders.filter(o => o.status === 'CANCELLED');
          const statusMeta: Record<string, { dot: string; text: string; label: string }> = {
            NEW:       { dot: 'bg-[#ff6b00]', text: 'text-[#ff6b00]', label: 'Pending' },
            PREPARING: { dot: 'bg-[#a04100]', text: 'text-[#a04100]', label: 'Preparing' },
            READY:     { dot: 'bg-blue-500',  text: 'text-blue-600',  label: 'Ready' },
            COMPLETED: { dot: 'bg-green-500', text: 'text-green-600', label: 'Completed' },
            CANCELLED: { dot: 'bg-gray-400',  text: 'text-gray-500',  label: 'Cancelled' },
          };
          const renderCard = (order: Order) => {
            const sm = statusMeta[order.status] ?? statusMeta.NEW;
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-3 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                    <img className="w-full h-full object-cover" src={order.items[0]?.image || FALLBACK_IMG} alt="" onError={e => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-[#1c1b1f] truncate">Order {order.orderId || order.id}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{order.items.length} Item{order.items.length !== 1 ? 's' : ''} • {formatFullDate(order.createdAt)}</p>
                  </div>
                  <p className="font-black text-base text-[#a04100] flex-shrink-0">₹{order.total}</p>
                </div>
                <div className="h-px bg-gray-100 mx-3" />
                <div className="px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sm.dot}`} />
                    <span className={`text-xs font-bold ${sm.text}`}>{sm.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-black rounded-full">PAID</span>
                    <button onClick={() => goToOrder(order.id)} className="px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg text-[10px] font-bold active:scale-95">Details</button>
                  </div>
                </div>
              </div>
            );
          };
          return (
            <div className="flex flex-col gap-4">
              {/* Top tabs: All Orders | Cancelled */}
              <div className="flex border-b border-gray-200 -mx-4 px-4 bg-white">
                {([{ key: 'live', label: 'All Orders' }, { key: 'cancelled', label: `Cancelled (${cancelledOrders.length})` }] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setOrdersTopTab(key)} className={`py-3 mr-6 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${ordersTopTab === key ? 'border-[#ff6b00] text-[#ff6b00]' : 'border-transparent text-gray-400'}`}>{label}</button>
                ))}
              </div>

              {ordersTopTab === 'live' ? (
                <>
                  {/* Scrollable status pills */}
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                    {(['NEW', 'PREPARING', 'COMPLETED'] as OrderStatus[]).map(tab => {
                      const count = orders.filter(o => o.status === tab).length;
                      const tabLabel: Record<string, string> = { NEW: 'Pending', PREPARING: 'Preparing', COMPLETED: 'Completed' };
                      return (
                        <button key={tab} onClick={() => setOrdersTab(tab)} className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap ${ordersTab === tab ? 'bg-[#a04100] text-white border-[#a04100]' : 'bg-white text-gray-600 border-gray-200'}`}>
                          {tabLabel[tab]}
                          {count > 0 && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${ordersTab === tab ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'}`}>{count}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {!storeOpen && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-amber-800 font-semibold">
                      <Power className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span>Store is closed. No new orders until reopened.</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    {orders.filter(o => o.status === ordersTab).length === 0 ? (
                      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                        <p className="text-xs text-gray-400 font-semibold">No {ordersTab.toLowerCase()} orders</p>
                        <p className="text-[10px] text-gray-400 mt-1">Orders from Firebase will appear here in real time</p>
                      </div>
                    ) : orders.filter(o => o.status === ordersTab).map(order => renderCard(order))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  {cancelledOrders.length === 0 ? (
                    <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                      <p className="text-xs text-gray-400 font-semibold">No cancelled orders</p>
                    </div>
                  ) : cancelledOrders.map(order => renderCard(order))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════
            ORDER DETAILS
        ══════════════════════════════════════════════ */}
        {activeScreen === 'order-details' && selectedOrderId && (() => {
          const order = orders.find(o => o.id === selectedOrderId);
          if (!order) return <p className="text-center py-12 text-sm text-gray-500">Order not found.</p>;
          const statusColors: Record<string, string> = {
            NEW: 'bg-orange-100 text-[#ff6b00]', PREPARING: 'bg-[#fdf3e7] text-[#a04100]',
            READY: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-green-100 text-green-700',
            CANCELLED: 'bg-gray-100 text-gray-500',
          };
          const statusLabels: Record<string, string> = { NEW: 'Pending', PREPARING: 'Preparing', READY: 'Ready', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
          return (
            <div className="flex flex-col gap-4">

              {/* Order ID + status */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-black text-[#1c1b1f]">Order {order.orderId || order.id}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-black ${statusColors[order.status] ?? statusColors.NEW}`}>
                  {statusLabels[order.status] ?? order.status}
                </span>
                <span className="text-xs text-gray-400">{formatFullDate(order.createdAt)}</span>
                <span className={`ml-auto px-2.5 py-1 rounded-full text-[10px] font-bold ${order.type === 'ONLINE' ? 'bg-[#e8f0fe] text-[#1a56db]' : 'bg-gray-100 text-gray-600'}`}>
                  {order.type === 'ONLINE' ? 'Online Order' : 'Takeaway'}
                </span>
              </div>

              {/* Items */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {order.items.map(item => (
                    <div key={item.id} className="p-4 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100 bg-gray-50">
                        <img className="w-full h-full object-cover" src={(item as any).image || FALLBACK_IMG} alt={item.name} onError={e => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[#1c1b1f]">{item.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.qty} × ₹{item.price.toFixed(2)}</p>
                      </div>
                      <span className="font-black text-sm text-[#a04100]">₹{(item.price * item.qty).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Bill summary */}
                <div className="border-t border-gray-100 px-4 py-4 flex flex-col gap-2">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span>₹{order.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Delivery</span>
                    <span className="text-green-600 font-semibold">FREE</span>
                  </div>
                  {order.taxes > 0 && (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>{storeInfo.gstRate > 0 ? `GST (${storeInfo.gstRate}%)` : 'Platform Fee'}</span>
                      <span>₹{order.taxes.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="font-black text-sm text-[#1c1b1f]">Total</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-black rounded-full">PAID</span>
                      <span className="font-black text-base text-[#a04100]">₹{order.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment details */}
              {order.type === 'ONLINE' && (() => {
                const rd = order.rawData ?? {};
                const pd = rd.payment_details ?? {};
                const upiId = pd.upi?.upi_id ?? pd.upi_id ?? '';
                const payGroup = (pd.payment_group ?? rd.payment_group ?? '').toLowerCase();
                const txnId = rd.payment_transaction_id ?? pd.cf_payment_id ?? '';
                const cfOrderId = rd.cf_order_id ?? '';
                const bankRef = pd.bank_reference ?? '';
                const settlementStatus = rd.settlement_status ?? '';
                const payStatus = (rd.payment_status ?? '').toUpperCase();
                const payTime = rd.payment_time ?? '';
                const rows: [string, string][] = [
                  ['Order ID', order.orderId ?? ''],
                  ['CF Order ID', cfOrderId],
                  ['Transaction ID', txnId],
                  ['Payment method', payGroup || (upiId ? 'UPI' : '')],
                  ['UPI ID', upiId],
                  ['Bank reference', bankRef],
                  ['Payment status', payStatus],
                  ['Settlement', settlementStatus],
                  ['Paid at', payTime ? formatFullDate(payTime) : ''],
                ].filter(([, v]) => v) as [string, string][];
                if (rows.length === 0) return null;
                return (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-50">
                      <h4 className="text-sm font-bold text-[#1c1b1f]">Payment details</h4>
                    </div>
                    <div className="px-4 py-3 flex flex-col gap-2.5">
                      {rows.map(([label, value]) => (
                        <div key={label} className="flex items-start justify-between gap-3">
                          <span className="text-[11px] text-gray-400 font-semibold flex-shrink-0">{label}</span>
                          <span className={`text-[11px] font-bold text-right break-all ${label === 'Payment status' ? (payStatus === 'SUCCESS' ? 'text-green-600' : 'text-red-500') : label === 'Settlement' ? (settlementStatus === 'settled' ? 'text-green-600' : 'text-amber-600') : 'text-[#1c1b1f]'}`}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Customer details */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <h4 className="text-sm font-bold text-[#1c1b1f]">Customer details</h4>
                </div>
                <div className="px-4 py-4 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Name</p>
                      <p className="text-sm font-bold text-[#a04100]">{order.customerName}</p>
                    </div>
                    {order.customerPhone && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Mobile</p>
                        <a href={`tel:${order.customerPhone}`} className="text-sm font-bold text-[#1a56db]">{order.customerPhone}</a>
                      </div>
                    )}
                  </div>
                  {order.customerAddress && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Delivery address</p>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-700 leading-relaxed">{order.customerAddress}</p>
                        <button onClick={() => navigator.clipboard?.writeText(order.customerAddress)} className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 active:bg-gray-50">
                          <MapPin className="w-3 h-3" />Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Note */}
              {order.note && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-4 flex gap-2.5">
                  <Info className="w-4 h-4 text-[#ff6b00] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-black text-[#ff6b00] uppercase tracking-wider mb-1">Note from customer</p>
                    <p className="text-sm text-gray-600">"{order.note}"</p>
                  </div>
                </div>
              )}

              {/* Activity timeline */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#1c1b1f]">Activity</h4>
                </div>
                <div className="px-4 py-4 flex flex-col gap-3">
                  {order.status !== 'NEW' && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#a04100] mt-1.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-[#1c1b1f]">Order {statusLabels[order.status]?.toLowerCase()}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Status updated via Windows app</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-[#1c1b1f]">Order received</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Via online store • ₹{order.total.toFixed(2)} processed through Cashfree</p>
                      <p className="text-[10px] text-gray-400">{formatFullDate(order.createdAt)}</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════
            HISTORY
        ══════════════════════════════════════════════ */}
        {activeScreen === 'history' && (
          <div className="flex flex-col gap-3">

            {/* Date filter + search icon */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0 flex-1">
                {([['all', 'All Time'], ['7days', 'Last 7 Days'], ['30days', 'Last 30 Days']] as [HistoryDateFilter, string][]).map(([f, label]) => (
                  <button key={f} onClick={() => setHistoryDateFilter(f)} className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all whitespace-nowrap ${historyDateFilter === f ? 'bg-[#a04100] text-white border-[#a04100]' : 'bg-white text-gray-600 border-gray-200'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => { if (historySearchOpen) { setHistorySearch(''); } setHistorySearchOpen(!historySearchOpen); }} className={`flex-shrink-0 p-1.5 rounded-full border transition-all ${historySearchOpen || historySearch ? 'bg-[#ff6b00] text-white border-[#ff6b00]' : 'bg-white text-gray-500 border-gray-200'}`}>
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Expandable search bar */}
            {(historySearchOpen || historySearch.length > 0) && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input autoFocus type="text" value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Search order ID or customer…" className="w-full pl-9 pr-9 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#ff6b00] outline-none shadow-sm" />
                <button onClick={() => { setHistorySearch(''); setHistorySearchOpen(false); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {/* Status filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
              {([['all', 'All'], ['NEW', 'Pending'], ['PREPARING', 'Preparing'], ['COMPLETED', 'Done'], ['CANCELLED', 'Cancelled']] as [HistoryStatusFilter, string][]).map(([f, label]) => (
                <button key={f} onClick={() => setHistoryStatusFilter(f)} className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all whitespace-nowrap ${historyStatusFilter === f ? 'bg-[#ff6b00] text-white border-[#ff6b00]' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Stats + bulk toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-400">
                {historyOrders.length} orders · ₹{Math.round(historyRevenue).toLocaleString('en-IN')}
                {historyBulkMode && historySelected.size > 0 && ` · ${historySelected.size} sel`}
              </span>
              {historyOrders.some(o => o.status === 'READY') && (
                <button onClick={() => { setHistoryBulkMode(!historyBulkMode); setHistorySelected(new Set()); }} className={`flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full font-bold border transition-all ${historyBulkMode ? 'bg-[#a04100] text-white border-[#a04100]' : 'bg-white border-gray-200 text-gray-600'}`}>
                  {historyBulkMode ? 'Cancel' : 'Bulk Ship'}
                </button>
              )}
            </div>

            {/* Bulk action bar */}
            {historyBulkMode && historySelected.size > 0 && (
              <div className="bg-[#a04100] text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                <span className="text-xs font-black">{historySelected.size} order{historySelected.size > 1 ? 's' : ''} selected</span>
                <button onClick={handleBulkDeliver} className="bg-white text-[#a04100] text-xs font-black px-4 py-1.5 rounded-lg active:scale-95">Mark All Delivered</button>
              </div>
            )}

            {/* Order list */}
            {historyOrders.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                <p className="text-xs text-gray-400 font-semibold">No orders found</p>
                <p className="text-[10px] text-gray-400 mt-1">Try a different date range or filter</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {historyOrders.map(order => {
                  const isBulkSelectable = historyBulkMode && order.status === 'READY';
                  const isSelected = historySelected.has(order.id);
                  const statusDot: Record<string, string> = { NEW: 'bg-[#ff6b00]', PREPARING: 'bg-[#a04100]', READY: 'bg-blue-500', COMPLETED: 'bg-green-500', CANCELLED: 'bg-gray-400' };
                  const statusText: Record<string, string> = { NEW: 'text-[#ff6b00]', PREPARING: 'text-[#a04100]', READY: 'text-blue-600', COMPLETED: 'text-green-600', CANCELLED: 'text-gray-400' };
                  const statusLabel: Record<string, string> = { NEW: 'Pending', PREPARING: 'Preparing', READY: 'Ready', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
                  return (
                    <div
                      key={order.id}
                      onClick={() => {
                        if (isBulkSelectable) {
                          setHistorySelected(prev => { const n = new Set(prev); n.has(order.id) ? n.delete(order.id) : n.add(order.id); return n; });
                        } else if (!historyBulkMode) {
                          goToOrder(order.id);
                        }
                      }}
                      className={`bg-white rounded-2xl border shadow-sm overflow-hidden cursor-pointer transition-all ${isSelected ? 'border-[#a04100]' : 'border-gray-100'}`}
                    >
                      <div className="p-3 flex items-center gap-3">
                        {historyBulkMode && (
                          <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${isBulkSelectable ? (isSelected ? 'bg-[#a04100] border-[#a04100]' : 'border-gray-300') : 'border-gray-200 bg-gray-50'}`}>
                            {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                        )}
                        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                          <img className="w-full h-full object-cover" src={order.items[0]?.image || FALLBACK_IMG} alt="" onError={e => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-[#1c1b1f] truncate">Order {order.orderId || order.id}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{order.items.length} Item{order.items.length !== 1 ? 's' : ''} • {formatFullDate(order.createdAt)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-black text-sm text-[#a04100]">₹{order.total}</p>
                          <span className={`text-[10px] font-bold ${order.type === 'ONLINE' ? 'text-blue-500' : 'text-gray-400'}`}>{order.type === 'ONLINE' ? 'Online' : 'POS'}</span>
                        </div>
                      </div>
                      <div className="h-px bg-gray-100 mx-3" />
                      <div className="px-3 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${statusDot[order.status] ?? 'bg-gray-300'}`} />
                          <span className={`text-xs font-bold ${statusText[order.status] ?? 'text-gray-500'}`}>{statusLabel[order.status] ?? order.status}</span>
                        </div>
                        {!historyBulkMode && <ChevronRight className="w-4 h-4 text-gray-300" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            MENU
        ══════════════════════════════════════════════ */}
        {activeScreen === 'menu' && (
          <div className="flex flex-col gap-3">
            {/* Header row: title + Online/POS toggle + search icon */}
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#1c1b1f] flex-1">Menu</h2>
              <div className="flex bg-gray-100 p-0.5 rounded-lg">
                <button onClick={() => { setMenuType('online'); setCategoryFilter('All'); setSearchQuery(''); }} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${menuType === 'online' ? 'bg-[#ff6b00] text-white shadow-sm' : 'text-gray-500'}`}>
                  <Wifi className="w-3 h-3" />Online
                  <span className={`px-1 rounded-full text-[9px] font-black ${menuType === 'online' ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-500'}`}>{onlineItems.length}</span>
                </button>
                <button onClick={() => { setMenuType('pos'); setCategoryFilter('All'); setSearchQuery(''); }} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${menuType === 'pos' ? 'bg-[#a04100] text-white shadow-sm' : 'text-gray-500'}`}>
                  <ShoppingBag className="w-3 h-3" />POS
                  <span className={`px-1 rounded-full text-[9px] font-black ${menuType === 'pos' ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-500'}`}>{posItems.length}</span>
                </button>
              </div>
              <button onClick={() => { if (menuSearchOpen) setSearchQuery(''); setMenuSearchOpen(!menuSearchOpen); }} className={`p-1.5 rounded-full border transition-all ${menuSearchOpen || searchQuery ? 'bg-[#ff6b00] text-white border-[#ff6b00]' : 'bg-white text-gray-500 border-gray-200'}`}>
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Expandable search */}
            {(menuSearchOpen || searchQuery.length > 0) && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input autoFocus type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={`Search ${menuType === 'online' ? 'online' : 'POS'} menu…`} className="w-full pl-9 pr-9 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#ff6b00] outline-none shadow-sm" />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3.5 h-3.5" /></button>}
              </div>
            )}

            {menuCategories.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {menuCategories.map(cat => (
                  <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-4 py-2 font-black text-xs rounded-full transition-all shadow-sm whitespace-nowrap ${categoryFilter === cat ? (menuType === 'online' ? 'bg-[#ff6b00] text-white' : 'bg-[#a04100] text-white') : 'bg-[#f1ecf2] text-[#5a4136] hover:bg-[#e5e1e7]'}`}>{cat}</button>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center px-1">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${menuType === 'online' ? 'bg-[#ff6b00]/10 text-[#ff6b00]' : 'bg-[#a04100]/10 text-[#a04100]'}`}>
                {menuType === 'online' ? 'Online Menu' : 'POS Menu'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 font-bold">{getFilteredMenuItems().length} items</span>
                <span className="text-[10px] text-gray-400">·</span>
                <span className="text-[10px] text-red-500 font-bold">{activeMenuItems.filter(i => !i.inStock).length} out of stock</span>
              </div>
            </div>

            {getFilteredMenuItems().length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-[#e2bfb0]/40 p-12 text-center shadow-sm">
                <p className="text-xs text-gray-500 font-bold mb-1">No items found</p>
                <p className="text-[10px] text-gray-400">{activeMenuItems.length === 0 ? `The ${menuType === 'online' ? 'products' : 'posProducts'} collection is empty in Firebase` : 'Try a different search or category'}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {getFilteredMenuItems().map(item => (
                <article key={item.id} className={`bg-white p-3.5 rounded-xl border border-gray-100 flex items-center justify-between shadow-sm hover:border-[#e2bfb0]/50 transition-all ${!item.inStock ? 'opacity-75' : ''}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-50 border border-gray-100 relative">
                      <img className="w-full h-full object-cover" src={item.image || FALLBACK_IMG} alt={item.name} onError={e => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }} />
                      {!item.inStock && <div className="absolute inset-0 bg-black/45 flex items-center justify-center"><Package className="w-5 h-5 text-white" /></div>}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-extrabold text-sm text-[#1c1b1f] leading-tight">{item.name}</h4>
                        {!item.inStock && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-[8px] font-black uppercase">Out of stock</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-bold text-[#ff6b00] text-sm">₹{item.price}</span>
                        <button onClick={() => { setEditingMenuItem(item); setEditPriceValue(item.price); }} className="bg-[#cee5ff]/20 text-[#00639a] p-1 rounded hover:bg-[#cee5ff]/40 active:scale-90"><Edit2 className="w-3 h-3" /></button>
                        <button onClick={() => setConfirmDeleteId(item.id)} className="bg-red-50 text-red-400 p-1 rounded hover:bg-red-100 active:scale-90"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      {item.category ? <span className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{item.category}</span> : null}
                    </div>
                  </div>
                  <button onClick={() => handleToggleStock(item.id)} className={`ml-3 w-11 h-6 rounded-full relative p-0.5 flex-shrink-0 transition-colors focus:outline-none ${item.inStock ? 'bg-[#ff6b00]' : 'bg-gray-300'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-150 ${item.inStock ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </article>
              ))}
            </div>

            <button onClick={() => setIsAddingItem(true)} className="fixed bottom-24 right-5 w-14 h-14 bg-[#ff6b00] hover:scale-105 active:scale-95 text-white rounded-full shadow-2xl flex items-center justify-center z-40 transition-all">
              <Plus className="w-8 h-8" />
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            SETTINGS
        ══════════════════════════════════════════════ */}
        {activeScreen === 'settings' && (
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-bold text-[#1c1b1f]">Settings</h2>

            {/* Store status toggle */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1c1b1f]">Store</p>
                  <p className={`text-xs font-semibold mt-0.5 ${storeOpen ? 'text-green-600' : 'text-gray-400'}`}>{storeOpen ? 'Open — accepting orders' : 'Closed — orders paused'}</p>
                </div>
                <button onClick={() => setShowStoreConfirm(true)} className={`relative w-14 h-7 rounded-full transition-colors duration-200 focus:outline-none ${storeOpen ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${storeOpen ? 'translate-x-8' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {/* Account */}
            {vendorEmail && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between">
                <p className="text-xs text-gray-400 font-semibold">Logged in as</p>
                <p className="text-xs font-bold text-[#1c1b1f]">{vendorEmail}</p>
              </div>
            )}

            {/* Store info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <p className="text-sm font-bold text-[#1c1b1f]">Store Info</p>
                {editingStoreInfo ? (
                  <div className="flex gap-2">
                    <button onClick={() => setEditingStoreInfo(false)} className="text-[11px] font-bold text-gray-400 px-3 py-1 rounded-lg border border-gray-200">Cancel</button>
                    <button onClick={handleSaveStoreInfo} className="text-[11px] font-bold text-white bg-[#ff6b00] px-3 py-1 rounded-lg">Save</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditDraft(storeInfo); setEditingStoreInfo(true); }} className="text-[11px] font-bold text-[#ff6b00] px-3 py-1 rounded-lg border border-[#ff6b00]/30">Edit</button>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {editingStoreInfo ? (
                  <>
                    {([
                      ['Name', 'storeName'],
                      ['Phone', 'phone'],
                      ['City', 'city'],
                      ['State', 'state'],
                      ['Pin Code', 'pinCode'],
                      ['GSTIN', 'gstin'],
                      ['Currency', 'currency'],
                    ] as [string, keyof StoreInfo][]).map(([label, key]) => (
                      <div key={key} className="flex items-center justify-between px-4 py-2">
                        <span className="text-xs text-gray-400 font-semibold w-20 shrink-0">{label}</span>
                        <input
                          className="flex-1 text-xs font-bold text-[#1c1b1f] text-right bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100 outline-none focus:border-[#ff6b00]"
                          value={String(editDraft[key] ?? '')}
                          onChange={e => setEditDraft(d => ({ ...d, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-xs text-gray-400 font-semibold">GST Rate %</span>
                      <input
                        type="number"
                        className="w-20 text-xs font-bold text-[#1c1b1f] text-right bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100 outline-none focus:border-[#ff6b00]"
                        value={editDraft.gstRate}
                        onChange={e => setEditDraft(d => ({ ...d, gstRate: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-xs text-gray-400 font-semibold">GST Type</span>
                      <input
                        className="w-28 text-xs font-bold text-[#1c1b1f] text-right bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100 outline-none focus:border-[#ff6b00]"
                        placeholder="included / excluded"
                        value={editDraft.gstType}
                        onChange={e => setEditDraft(d => ({ ...d, gstType: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-gray-400 font-semibold">GST Enabled</span>
                      <button onClick={() => setEditDraft(d => ({ ...d, gstEnabled: !d.gstEnabled }))} className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${editDraft.gstEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${editDraft.gstEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </>
                ) : (
                  ([
                    ['Name', storeInfo.storeName],
                    ['Phone', storeInfo.phone || '—'],
                    ['City', storeInfo.city || '—'],
                    ['State', storeInfo.state || '—'],
                    ['Pin Code', storeInfo.pinCode || '—'],
                    ['GSTIN', storeInfo.gstin || '—'],
                    ['GST', storeInfo.gstEnabled ? `${storeInfo.gstRate}% (${storeInfo.gstType || 'included'})` : 'Disabled'],
                    ['Currency', storeInfo.currency],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-gray-400 font-semibold">{label}</span>
                      <span className="text-xs font-bold text-[#1c1b1f]">{value}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Hours & shifts */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <p className="text-sm font-bold text-[#1c1b1f]">Hours</p>
                {editingStoreInfo && <span className="text-[10px] text-gray-400">editing</span>}
              </div>
              <div className="flex divide-x divide-gray-50">
                <div className="flex-1 px-4 py-3">
                  <span className="text-[10px] text-gray-400 font-semibold block mb-1">Opens</span>
                  {editingStoreInfo ? (
                    <input className="w-full text-sm font-black text-[#a04100] bg-gray-50 rounded-lg px-2 py-1 border border-gray-100 outline-none focus:border-[#ff6b00]" placeholder="e.g. 09:00" value={editDraft.openingTime} onChange={e => setEditDraft(d => ({ ...d, openingTime: e.target.value }))} />
                  ) : (
                    <span className="text-sm font-black text-[#a04100]">{storeInfo.openingTime || '—'}</span>
                  )}
                </div>
                <div className="flex-1 px-4 py-3">
                  <span className="text-[10px] text-gray-400 font-semibold block mb-1">Closes</span>
                  {editingStoreInfo ? (
                    <input className="w-full text-sm font-black text-[#a04100] bg-gray-50 rounded-lg px-2 py-1 border border-gray-100 outline-none focus:border-[#ff6b00]" placeholder="e.g. 22:00" value={editDraft.closingTime} onChange={e => setEditDraft(d => ({ ...d, closingTime: e.target.value }))} />
                  ) : (
                    <span className="text-sm font-black text-[#a04100]">{storeInfo.closingTime || '—'}</span>
                  )}
                </div>
              </div>
              {storeInfo.shifts.length > 0 && (
                <div className="border-t border-gray-50 divide-y divide-gray-50">
                  {storeInfo.shifts.map(s => (
                    <div key={s.name} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-gray-500 font-semibold">{s.name}</span>
                      <span className="text-xs font-bold text-[#1c1b1f]">{s.startTime} – {s.endTime}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sound alert toggle */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1c1b1f]">Order alerts</p>
                  <p className="text-xs text-gray-400 mt-0.5">Sound ping on new orders</p>
                </div>
                <button onClick={() => setSoundEnabled(!soundEnabled)} className={`relative w-14 h-7 rounded-full transition-colors duration-200 focus:outline-none ${soundEnabled ? 'bg-[#ff6b00]' : 'bg-gray-300'}`}>
                  <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${soundEnabled ? 'translate-x-8' : 'translate-x-1'}`} />
                </button>
              </div>
              <button onClick={playAlertSound} className="mt-3 w-full py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 active:bg-gray-50">Test sound</button>
            </div>

            {/* Reset */}
            <button onClick={handleResetData} className="w-full py-3 bg-white rounded-2xl border border-red-100 text-red-500 text-xs font-bold shadow-sm active:scale-95">Reset local data</button>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════
          BOTTOM NAV — 5 tabs
      ══════════════════════════════════════════════ */}
      <footer className="fixed bottom-0 left-0 w-full flex justify-around items-center px-1 pb-3 pt-2 bg-white border-t border-[#e2bfb0]/35 z-50 shadow-[0_-10px_25px_rgba(0,0,0,0.035)]">
        {[
          { screen: 'dashboard', icon: 'dashboard',       label: 'Home' },
          { screen: 'orders',    icon: 'receipt_long',    label: 'Orders' },
          { screen: 'history',   icon: 'history',         label: 'History' },
          { screen: 'menu',      icon: 'restaurant_menu', label: 'Menu' },
          { screen: 'settings',  icon: 'settings',        label: 'Settings' },
        ].map(({ screen, icon, label }) => {
          const isActive = activeScreen === screen || (screen === 'orders' && activeScreen === 'order-details');
          return (
            <button key={screen} onClick={() => { setActiveScreen(screen as ScreenType); setSelectedOrderId(null); }} className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all active:scale-90 ${isActive ? 'text-[#ff6b00]' : 'text-gray-400'}`}>
              <span className="material-symbols-outlined text-[20px] mb-0.5" style={{ fontVariationSettings: `'FILL' ${isActive ? '1' : '0'}` }}>{icon}</span>
              <span className="text-[8px] font-black uppercase tracking-widest font-mono">{label}</span>
            </button>
          );
        })}
      </footer>

      {/* ══════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════ */}

      {/* Edit price modal */}
      {editingMenuItem && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl flex flex-col gap-3.5">
            <h3 className="text-xs font-black text-[#5a4136] uppercase tracking-widest border-b border-gray-100 pb-2">Edit Price: {editingMenuItem.name}</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-black text-gray-400 uppercase">New Price (₹)</label>
              <input type="number" value={editPriceValue} onChange={e => setEditPriceValue(Number(e.target.value))} className="px-3.5 py-2.5 border border-[#e2bfb0]/35 rounded-xl outline-none font-bold text-sm text-[#a04100]" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditingMenuItem(null)} className="flex-1 py-2.5 border border-[#8e7164] text-[#1c1b1f] text-xs font-bold rounded-lg">Cancel</button>
              <button onClick={handleSavePrice} className="flex-1 py-2.5 bg-[#ff6b00] text-white text-xs font-bold rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add item modal */}
      {isAddingItem && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddNewItem} className="bg-white rounded-2xl w-full max-w-sm p-4 shadow-xl flex flex-col gap-3.5">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <div>
                <h3 className="text-xs font-black text-[#a04100] uppercase tracking-widest">Add Item</h3>
                <span className={`text-[9px] font-bold ${menuType === 'online' ? 'text-[#ff6b00]' : 'text-[#a04100]'}`}>Adding to {menuType === 'online' ? 'Online' : 'POS'} menu</span>
              </div>
              <button type="button" onClick={() => setIsAddingItem(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Item Name *', value: newItemName, setter: setNewItemName, placeholder: 'e.g. Masala Paneer', type: 'text' },
                { label: 'Price (₹) *', value: newItemPrice, setter: setNewItemPrice, placeholder: 'e.g. 150', type: 'number' },
                { label: 'Category', value: newItemCategory, setter: setNewItemCategory, placeholder: 'e.g. Main Course', type: 'text' },
                { label: 'Image URL (Optional)', value: newItemImage, setter: setNewItemImage, placeholder: 'Paste image link...', type: 'text' },
              ].map(({ label, value, setter, placeholder, type }) => (
                <div key={label} className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase">{label}</label>
                  <input type={type} value={value} onChange={e => setter(e.target.value)} placeholder={placeholder} className="px-3.5 py-2.5 border border-[#e2bfb0]/35 rounded-xl outline-none text-xs font-bold text-gray-800" />
                </div>
              ))}
            </div>
            <button type="submit" className={`w-full text-white py-2.5 rounded-xl text-xs font-black shadow active:scale-95 uppercase tracking-wide mt-1 ${menuType === 'online' ? 'bg-[#ff6b00]' : 'bg-[#a04100]'}`}>
              Add to {menuType === 'online' ? 'Online' : 'POS'} Menu
            </button>
          </form>
        </div>
      )}

      {/* Store open/close confirm */}
      {showStoreConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50 p-4 pb-8">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className={`px-5 py-4 ${storeOpen ? 'bg-red-50' : 'bg-green-50'}`}>
              <p className="text-sm font-black text-[#1c1b1f]">{storeOpen ? 'Close the store?' : 'Open the store?'}</p>
              <p className="text-xs text-gray-500 mt-1">{storeOpen ? 'New orders will be paused until you reopen.' : 'Customers will be able to place new orders.'}</p>
            </div>
            <div className="flex divide-x divide-gray-100">
              <button onClick={() => setShowStoreConfirm(false)} className="flex-1 py-3.5 text-sm font-bold text-gray-500 active:bg-gray-50">Cancel</button>
              <button onClick={() => { toggleStoreOpen(); setShowStoreConfirm(false); }} className={`flex-1 py-3.5 text-sm font-black ${storeOpen ? 'text-red-600' : 'text-green-600'} active:bg-gray-50`}>
                {storeOpen ? 'Yes, Close' : 'Yes, Open'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 shadow-xl flex flex-col gap-4 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto"><Trash2 className="w-6 h-6 text-red-500" /></div>
            <div>
              <h3 className="font-black text-sm text-gray-900">Remove this item?</h3>
              <p className="text-xs text-gray-500 mt-1">Permanently deletes <span className="font-bold text-gray-700">{activeMenuItems.find(i => i.id === confirmDeleteId)?.name}</span> from the {menuType === 'online' ? 'Online' : 'POS'} menu.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDeleteMenuItem(confirmDeleteId)} className="flex-1 py-2.5 bg-red-500 text-white text-xs font-black rounded-xl hover:bg-red-600 active:scale-95">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
