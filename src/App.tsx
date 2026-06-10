/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  Store, Bell, Rocket, TrendingUp, DollarSign, ShoppingBag, MapPin, CheckCircle, 
  Search, Plus, Phone, Clock, Utensils, X, Edit2, ArrowLeft, Volume2, VolumeX,
  CheckSquare, Square, ShoppingCart, CalendarDays, Trash2, Power, Wifi
} from 'lucide-react';
import { ScreenType, Order, MenuItem, OrderStatus, KitchenStats } from './types';

import { db } from './firebase';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

type DateFilter = 'today' | 'yesterday' | 'month';
type MenuType = 'online' | 'pos';

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
  if (['NEW','PENDING','PLACED','CONFIRMED'].includes(s)) return 'NEW';
  if (['PREPARING','ACCEPTED','PROCESSING','IN_PROGRESS'].includes(s)) return 'PREPARING';
  if (['READY','READY_FOR_PICKUP','OUT_FOR_DELIVERY'].includes(s)) return 'READY';
  if (['COMPLETED','DELIVERED','DONE','PAID'].includes(s)) return 'COMPLETED';
  return 'NEW';
}

function normaliseOrder(id: string, data: any): Order {
  let createdAt = '';
  const raw = data.createdAt ?? data.created_at ?? data.timestamp ?? data.orderTime ?? data.placedAt;
  if (raw?.toDate) createdAt = raw.toDate().toISOString();
  else if (typeof raw === 'string') createdAt = raw;
  else if (typeof raw === 'number') createdAt = new Date(raw).toISOString();
  else createdAt = new Date().toISOString();

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
  const taxes = data.taxes ?? data.tax ?? data.gst ?? 0;
  const total = data.total ?? data.totalAmount ?? data.amount ?? data.grandTotal ?? (subtotal + taxes);

  return {
    id,
    customerName: data.customerName ?? data.customer?.name ?? data.userName ?? data.name ?? 'Customer',
    customerPhone: data.customerPhone ?? data.customer?.phone ?? data.phone ?? data.mobile ?? '',
    customerAddress: data.customerAddress ?? data.customer?.address ?? data.address ?? data.deliveryAddress ?? '',
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
  };
}

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [onlineItems, setOnlineItems] = useState<MenuItem[]>([]);
  const [posItems, setPosItems] = useState<MenuItem[]>([]);
  const [storeOpen, setStoreOpen] = useState<boolean>(true);
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [menuType, setMenuType] = useState<MenuType>('online');

  // Real-time orders listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'orders'), (snapshot) => {
      if (!snapshot.empty) {
        setOrders(snapshot.docs.map(d => normaliseOrder(d.id, d.data())));
      }
    });
    return () => unsub();
  }, []);

  // Online menu — 'products' collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      setOnlineItems(snapshot.docs.map(d => normaliseProduct(d.id, d.data())));
    });
    return () => unsub();
  }, []);

  // POS menu — 'posProducts' collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'posProducts'), (snapshot) => {
      setPosItems(snapshot.docs.map(d => normaliseProduct(d.id, d.data())));
    });
    return () => unsub();
  }, []);

  // Store open/closed from Firestore settings
  useEffect(() => {
    const ref = doc(db, 'settings', 'store');
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setStoreOpen(snap.data().isOpen ?? true);
      } else {
        setDoc(ref, { isOpen: true });
        setStoreOpen(true);
      }
      setStoreLoaded(true);
    });
    return () => unsub();
  }, []);

  const toggleStoreOpen = async () => {
    const next = !storeOpen;
    setStoreOpen(next);
    await setDoc(doc(db, 'settings', 'store'), { isOpen: next }, { merge: true });
    setNotifications(prev => [`Store is now ${next ? 'OPEN — accepting orders' : 'CLOSED — orders paused'}.`, ...prev]);
  };

  const activeMenuItems = menuType === 'online' ? onlineItems : posItems;
  const activeCollection = menuType === 'online' ? 'products' : 'posProducts';

  const [activeScreen, setActiveScreen] = useState<ScreenType>(() => (localStorage.getItem('aromas_screen') as ScreenType) || 'dashboard');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => localStorage.getItem('aromas_selected_order_id') || null);
  const [ordersTab, setOrdersTab] = useState<OrderStatus>(() => (localStorage.getItem('aromas_orders_tab') as OrderStatus) || 'NEW');
  const [kdsMode, setKdsMode] = useState<boolean>(() => localStorage.getItem('aromas_kds_mode') === 'true');
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [editPriceValue, setEditPriceValue] = useState<number>(0);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemImage, setNewItemImage] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<string[]>(['Kitchen system online.']);
  const [simulatedOrderOverlay, setSimulatedOrderOverlay] = useState<Order | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem('aromas_screen', activeScreen); }, [activeScreen]);
  useEffect(() => {
    if (selectedOrderId) localStorage.setItem('aromas_selected_order_id', selectedOrderId);
    else localStorage.removeItem('aromas_selected_order_id');
  }, [selectedOrderId]);
  useEffect(() => { localStorage.setItem('aromas_orders_tab', ordersTab); }, [ordersTab]);
  useEffect(() => { localStorage.setItem('aromas_kds_mode', String(kdsMode)); }, [kdsMode]);

  const getDateBounds = (filter: DateFilter) => {
    const now = new Date();
    const s = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const e = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    if (filter === 'today') return { start: s(now), end: e(now) };
    if (filter === 'yesterday') { const y = new Date(now); y.setDate(now.getDate() - 1); return { start: s(y), end: e(y) }; }
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: e(now) };
  };

  const getFilteredStats = (filter: DateFilter) => {
    const { start, end } = getDateBounds(filter);
    const filtered = orders.filter(o => { const t = new Date(o.createdAt).getTime(); return t >= start.getTime() && t <= end.getTime(); });
    const revenue = filtered.reduce((s, o) => s + (o.total ?? 0), 0);
    return { orderCount: filtered.length, revenue: Math.round(revenue) };
  };

  const filteredStats = getFilteredStats(dateFilter);
  const filterLabels: Record<DateFilter, string> = { today: 'Today', yesterday: 'Yesterday', month: 'This Month' };

  const playAlertSound = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch (e) {}
  };

  const triggerSimulation = () => {
    playAlertSound();
    setSimulatedOrderOverlay({
      id: 'O025', customerName: 'Aishwarya Roy', customerPhone: '+91 95432 12345',
      customerAddress: 'Hostel 11, Room 403, IIT Campus', status: 'NEW', type: 'ONLINE',
      time: 'Just Now', createdAt: new Date().toISOString(),
      note: 'Extra spicy please!',
      items: [
        { id: 'm7', name: 'Masala Dosa', category: 'Main Course', price: 95, qty: 2 },
        { id: 'm8', name: 'Filter Coffee', category: 'Beverages', price: 20, qty: 1 }
      ],
      subtotal: 210, taxes: 10.50, total: 220.50, checkedItems: []
    });
  };

  const handleAcceptSimulated = () => {
    if (!simulatedOrderOverlay) return;
    const accepted = { ...simulatedOrderOverlay, status: 'PREPARING' as OrderStatus };
    setOrders(prev => [accepted, ...prev]);
    setNotifications(prev => [`Accepted Order #${simulatedOrderOverlay.id}!`, ...prev]);
    setSimulatedOrderOverlay(null);
    setOrdersTab('PREPARING');
    setActiveScreen('orders');
  };

  const handleUpdateOrderStatus = async (id: string, newStatus: OrderStatus) => {
    const order = orders.find(o => o.id === id);
    if (order) {
      await setDoc(doc(db, 'orders', id), { ...order, status: newStatus, time: 'Just Now' }, { merge: true });
    } else {
      await updateDoc(doc(db, 'orders', id), { status: newStatus, time: 'Just Now' });
    }
    setNotifications(prev => [`Order #${id} → ${newStatus}`, ...prev]);
  };

  const handleKdsToggleItemCheck = (orderId: string, itemName: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      const checked = o.checkedItems || [];
      return { ...o, checkedItems: checked.includes(itemName) ? checked.filter(c => c !== itemName) : [...checked, itemName] };
    }));
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

  const getStats = (): KitchenStats => {
    const completedCount = orders.filter(o => o.status === 'COMPLETED').length;
    const todayRevenue = Math.round(orders.filter(o => o.status === 'COMPLETED').reduce((s, o) => s + o.total, 0));
    return {
      activeCount: orders.filter(o => o.status === 'PREPARING' || o.status === 'NEW').length,
      pendingCount: orders.filter(o => o.status === 'NEW').length,
      completedCount, queueCount: orders.filter(o => o.status === 'PREPARING').length, todayRevenue
    };
  };
  const stats = getStats();

  const getFilteredMenuItems = () => activeMenuItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get unique categories from current menu
  const menuCategories = ['All', ...Array.from(new Set(activeMenuItems.map(i => i.category).filter(Boolean)))];
  const [categoryFilter, setCategoryFilter] = useState('All');

  const getDisplayedItems = () => {
    const base = getFilteredMenuItems();
    if (categoryFilter === 'All') return base;
    return base.filter(i => i.category === categoryFilter);
  };

  const handleToggleStock = async (id: string) => {
    const item = activeMenuItems.find(i => i.id === id);
    if (!item) return;
    const next = !item.inStock;
    await updateDoc(doc(db, activeCollection, id), { inStock: next, isAvailable: next });
    setNotifications(p => [`${item.name} → ${next ? 'IN STOCK' : 'OUT OF STOCK'}`, ...p]);
  };

  const handleDeleteMenuItem = async (id: string) => {
    const item = activeMenuItems.find(i => i.id === id);
    await deleteDoc(doc(db, activeCollection, id));
    setNotifications(p => [`${item?.name ?? 'Item'} removed from ${menuType === 'online' ? 'Online' : 'POS'} menu.`, ...p]);
    setConfirmDeleteId(null);
  };

  const handleSavePrice = async () => {
    if (!editingMenuItem) return;
    await updateDoc(doc(db, activeCollection, editingMenuItem.id), { price: editPriceValue });
    setNotifications(prev => [`${editingMenuItem.name} price → ₹${editPriceValue}`, ...prev]);
    setEditingMenuItem(null);
  };

  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) { alert('Please enter name and price.'); return; }
    const newItem = {
      name: newItemName, price: Number(newItemPrice),
      category: newItemCategory || 'General',
      inStock: true, isAvailable: true,
      imageURL: newItemImage || '',
      image: newItemImage || '',
      createdAt: new Date().toISOString(),
    };
    const id = `item_${Date.now()}`;
    await setDoc(doc(db, activeCollection, id), newItem);
    setNotifications(prev => [`${newItemName} added to ${menuType === 'online' ? 'Online' : 'POS'} menu.`, ...prev]);
    setNewItemName(''); setNewItemPrice(''); setNewItemCategory(''); setNewItemImage('');
    setIsAddingItem(false);
  };

  const FALLBACK_IMG = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';

  return (
    <div className="bg-[#fdf8fd] text-[#1c1b1f] font-sans min-h-screen relative pb-24 md:pb-28">

      {/* TOP HEADER */}
      <header className="bg-white sticky top-0 border-b border-[#e2bfb0]/30 shadow-sm z-40">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            {activeScreen === 'order-details' ? (
              <button onClick={() => { setActiveScreen('orders'); setSelectedOrderId(null); }} className="p-1.5 hover:bg-[#f1ecf2] rounded-full active:scale-95 text-[#a04100] mr-1">
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : <Store className="w-6 h-6 text-[#a04100]" />}
            <div>
              <h1 className="text-base md:text-lg font-bold text-[#a04100] tracking-tight">
                {activeScreen === 'order-details' ? `Order #${selectedOrderId}` : 'Aromas Dhaba'}
              </h1>
              {activeScreen !== 'order-details' && (
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${storeOpen ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  <span className={`text-[9px] font-black uppercase tracking-widest ${storeOpen ? 'text-green-600' : 'text-gray-400'}`}>
                    {storeLoaded ? (storeOpen ? 'Store Open' : 'Store Closed') : '...'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(activeScreen === 'orders' || activeScreen === 'order-details') && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-[#cee5ff] text-[#001d32] border border-[#96ccff] rounded-full text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 text-[#004a75]" /><span>AVG 12M</span>
              </div>
            )}
            <button onClick={triggerSimulation} className="text-[10px] hidden md:flex items-center gap-1 bg-[#ff6b00]/10 hover:bg-[#ff6b00]/20 border border-[#ff6b00]/30 text-[#ff6b00] px-3 py-1.5 rounded-full font-bold active:scale-95">
              <Rocket className="w-3 h-3" />SIMULATE
            </button>
            <button onClick={toggleStoreOpen} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 ${storeOpen ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-300 text-gray-600 hover:bg-gray-400'}`}>
              <Power className="w-3 h-3" />{storeOpen ? 'OPEN' : 'CLOSED'}
            </button>
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

      {/* STORE CLOSED BANNER */}
      {!storeOpen && storeLoaded && (
        <div className="bg-gray-800 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-bold z-30">
          <Power className="w-3.5 h-3.5 text-gray-400" />
          <span>Store is closed — new orders paused. <span className="underline cursor-pointer" onClick={toggleStoreOpen}>Tap to reopen</span></span>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 pt-5 flex flex-col gap-5">

        {/* ====== DASHBOARD ====== */}
        {activeScreen === 'dashboard' && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-[#1c1b1f] tracking-tight">Aromas Vendor Dashboard</h2>
              <p className="text-xs text-[#5a4136]/80 font-medium mt-0.5">Manage your kitchen operations and sales.</p>
            </div>
            <div className="flex gap-2">
              {(['today', 'yesterday', 'month'] as DateFilter[]).map((f) => (
                <button key={f} onClick={() => setDateFilter(f)} className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all ${dateFilter === f ? 'bg-[#a04100] text-white shadow-md' : 'bg-[#f1ecf2] text-[#5a4136] hover:bg-[#e5e1e7]'}`}>
                  <CalendarDays className="w-3 h-3" />{filterLabels[f]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-[#e2bfb0]/30 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
                <div className="flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-[#a04100]" /><span className="text-[10px] font-black tracking-wider uppercase text-[#5a4136]/70">Revenue</span></div>
                <span className="text-2xl font-extrabold text-[#a04100]">₹{filteredStats.revenue.toLocaleString('en-IN')}</span>
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#ff6b00]">
                  <TrendingUp className="w-3 h-3" />
                  <span>{dateFilter === 'today' ? '+12% vs yesterday' : dateFilter === 'yesterday' ? '+8% vs prev day' : '+18% vs last month'}</span>
                </div>
              </div>
              <div className="bg-white border border-[#e2bfb0]/30 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
                <div className="flex items-center gap-1.5"><ShoppingCart className="w-4 h-4 text-[#a04100]" /><span className="text-[10px] font-black tracking-wider uppercase text-[#5a4136]/70">Orders</span></div>
                <span className="text-2xl font-extrabold text-[#1c1b1f]">{filteredStats.orderCount}</span>
                <div className="text-[10px] font-bold text-[#5a4136]/60">{filterLabels[dateFilter]}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#e2bfb0]/30" />
              <span className="text-[9px] font-black tracking-widest text-[#5a4136]/40 uppercase">Live Status</span>
              <div className="flex-1 h-px bg-[#e2bfb0]/30" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {[
                { label: 'New', status: 'NEW' as OrderStatus, count: orders.filter(o => o.status === 'NEW').length, bg: 'bg-[#fff3ed]', border: 'border-[#ff6b00]/20', color: 'text-[#ff6b00]' },
                { label: 'Preparing', status: 'PREPARING' as OrderStatus, count: orders.filter(o => o.status === 'PREPARING').length, bg: 'bg-[#fdf3e7]', border: 'border-[#a04100]/20', color: 'text-[#a04100]' },
                { label: 'Ready', status: 'READY' as OrderStatus, count: orders.filter(o => o.status === 'READY').length, bg: 'bg-[#edf4ff]', border: 'border-blue-200', color: 'text-blue-600' },
                { label: 'Done', status: 'COMPLETED' as OrderStatus, count: stats.completedCount, bg: 'bg-[#edfaf0]', border: 'border-green-200', color: 'text-green-700' },
              ].map(({ label, status, count, bg, border, color }) => (
                <div key={status} className={`${bg} border ${border} p-3 rounded-xl flex flex-col justify-between cursor-pointer hover:opacity-80 transition-all`} onClick={() => { setActiveScreen('orders'); setOrdersTab(status); }}>
                  <span className={`text-[9px] font-extrabold ${color} opacity-80 uppercase`}>{label}</span>
                  <span className={`text-2xl font-bold ${color}`}>{count}</span>
                </div>
              ))}
            </div>
            <button onClick={() => { setActiveScreen('orders'); setOrdersTab('NEW'); }} className="w-full bg-[#ff6b00] text-white py-4 rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
              <Rocket className="w-5 h-5 animate-bounce" />
              <span className="font-bold text-sm tracking-widest uppercase">View Live Orders</span>
            </button>
          </div>
        )}

        {/* ====== ORDERS ====== */}
        {activeScreen === 'orders' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-[#1c1b1f]">Operational Matrix</h2>
                <p className="text-[10px] text-gray-500 font-black tracking-widest uppercase">Order Dispatch Control</p>
              </div>
              <div className="bg-[#f1ecf2] p-1 rounded-xl flex shadow-inner border border-gray-200">
                <button onClick={() => setKdsMode(false)} className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${!kdsMode ? 'bg-[#a04100] text-white shadow' : 'text-gray-500'}`}>List</button>
                <button onClick={() => setKdsMode(true)} className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${kdsMode ? 'bg-[#a04100] text-white shadow' : 'text-gray-500'}`}>KDS</button>
              </div>
            </div>
            {!storeOpen && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-amber-800 font-semibold">
                <Power className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span>Store is closed. No new orders until reopened.</span>
              </div>
            )}
            {!kdsMode && (
              <nav className="flex overflow-x-auto border-b border-[#e2bfb0]/20 bg-white shadow-sm rounded-xl">
                {(['NEW', 'PREPARING', 'READY', 'COMPLETED'] as OrderStatus[]).map((tab) => {
                  const count = orders.filter(o => o.status === tab).length;
                  const colors = { NEW: 'text-[#ff6b00]', PREPARING: 'text-[#a04100]', READY: 'text-blue-600', COMPLETED: 'text-green-700' };
                  return (
                    <button key={tab} onClick={() => setOrdersTab(tab)} className={`flex-1 py-3 px-1 flex flex-col items-center font-bold tracking-widest text-[10px] border-b-2 uppercase transition-all ${ordersTab === tab ? 'border-[#a04100] text-[#a04100] bg-[#a04100]/5' : 'border-transparent text-gray-500'}`}>
                      <span>{tab}</span>
                      <span className={`text-[9px] font-extrabold mt-0.5 ${colors[tab]}`}>({count})</span>
                    </button>
                  );
                })}
              </nav>
            )}
            {!kdsMode ? (
              <div className="flex flex-col gap-4">
                {orders.filter(o => o.status === ordersTab).length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-[#e2bfb0]/40 p-12 text-center shadow-sm">
                    <p className="text-xs text-gray-500 font-bold mb-2">No {ordersTab.toLowerCase()} orders</p>
                    <button onClick={triggerSimulation} className="bg-[#ff6b00] text-white rounded-full text-xs font-bold px-4 py-2 shadow">Simulate Order</button>
                  </div>
                ) : orders.filter(o => o.status === ordersTab).map((order) => (
                  <article key={order.id} className="bg-white rounded-xl border-2 order-card-pulse shadow-sm overflow-hidden hover:border-[#ff6b00]/50 transition-all">
                    <div className="p-4 flex justify-between items-start border-b border-[#e2bfb0]/25 bg-[#f7f2f8]">
                      <div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black inline-flex items-center gap-1 mb-1 ${order.type === 'ONLINE' ? 'bg-[#cee5ff] text-[#001d32]' : 'bg-gray-100 text-[#5a4136]'}`}>
                          <span className="material-symbols-outlined text-[12px]">{order.type === 'ONLINE' ? 'language' : 'shopping_bag'}</span>
                          {order.type === 'ONLINE' ? 'Online Order' : 'Takeaway'}
                        </span>
                        <h3 className="font-bold text-sm text-[#1c1b1f]">Order #{order.id}</h3>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-sm text-[#a04100]">₹{order.total}</span>
                        <p className="text-[9px] text-gray-400 font-bold mt-0.5">{order.time}</p>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col gap-2">
                      {order.items.map(item => (
                        <div key={item.id} className="text-xs font-semibold text-gray-800 flex justify-between">
                          <span><span className="font-extrabold text-[#ff6b00] mr-2">{item.qty}x</span>{item.name}</span>
                        </div>
                      ))}
                      <div className="pt-2 flex gap-2 items-start text-[11px] text-gray-500 border-t border-gray-100">
                        {order.type === 'ONLINE'
                          ? <><MapPin className="w-3.5 h-3.5 text-[#a04100] flex-shrink-0 mt-0.5" /><span className="font-semibold text-gray-600">{order.customerAddress}</span></>
                          : <><ShoppingBag className="w-3.5 h-3.5 text-[#ff6b00] flex-shrink-0 mt-0.5" /><span className="font-semibold text-gray-600">Self Takeaway</span></>}
                      </div>
                    </div>
                    <div className="px-4 pb-4 flex gap-3">
                      <button onClick={() => { setSelectedOrderId(order.id); setActiveScreen('order-details'); }} className="px-4 py-2 border border-[#8e7164] text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-bold active:scale-95">Details</button>
                      {order.status === 'NEW' && <>
                        <button onClick={() => handleUpdateOrderStatus(order.id, 'PREPARING')} className="flex-1 bg-[#ff6b00] text-white py-2 rounded-lg text-xs font-black shadow active:scale-95">Accept</button>
                        <button onClick={async () => { if (window.confirm('Reject order ' + order.id + '?')) await deleteDoc(doc(db, 'orders', order.id)); }} className="px-3 py-2 border border-red-300 bg-red-50 text-red-700 font-bold rounded-lg text-xs active:scale-95">Reject</button>
                      </>}
                      {order.status === 'PREPARING' && <button onClick={() => handleUpdateOrderStatus(order.id, 'READY')} className="flex-1 bg-[#a04100] text-white py-2 rounded-lg text-xs font-black shadow active:scale-95">Mark Ready</button>}
                      {order.status === 'READY' && <button onClick={() => handleUpdateOrderStatus(order.id, 'COMPLETED')} className="flex-1 bg-green-700 text-white py-2 rounded-lg text-xs font-black shadow flex items-center justify-center gap-1.5 active:scale-95"><CheckCircle className="w-4 h-4" />Handover</button>}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  {[['Active', String(stats.activeCount), 'text-[#ff6b00]'], ['Pending', String(stats.pendingCount), 'text-blue-600'], ['Completed', String(stats.completedCount), 'text-gray-700'], ['Queue', String(stats.queueCount), 'text-[#ba1a1a]']].map(([label, val, color]) => (
                    <div key={label} className="bg-white p-3 rounded-xl shadow-sm border border-[#e2bfb0]/30 flex flex-col items-center">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
                      <span className={`text-2xl font-black ${color}`}>{val}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {orders.filter(o => o.status === 'PREPARING' || o.status === 'NEW').length === 0 ? (
                    <div className="col-span-2 bg-white rounded-xl border border-dashed border-[#e2bfb0]/40 p-12 text-center shadow">
                      <p className="text-xs text-gray-500 font-bold mb-1">No pending orders.</p>
                      <button onClick={triggerSimulation} className="bg-[#ff6b00] text-white rounded-full text-xs font-bold px-4 py-2 mt-2 shadow">Simulate</button>
                    </div>
                  ) : orders.filter(o => o.status === 'PREPARING' || o.status === 'NEW').map((order) => (
                    <section key={order.id} className="bg-white border-2 border-[#e2bfb0]/40 rounded-xl overflow-hidden shadow-md">
                      <div className={`p-4 flex justify-between items-center ${order.type === 'ONLINE' ? 'bg-[#cee5ff] text-[#001d32]' : 'bg-[#fed3c7] text-[#795950]'}`}>
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-black tracking-widest">
                            <span className="material-symbols-outlined text-[13px]">{order.type === 'ONLINE' ? 'language' : 'takeout_dining'}</span>
                            {order.type === 'ONLINE' ? 'ONLINE' : 'TAKEAWAY'}
                          </div>
                          <h4 className="font-extrabold text-lg">{order.id}</h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-[#ff6b00] text-white">{order.status}</span>
                      </div>
                      <div className="p-4 flex flex-col gap-2.5">
                        {order.items.map(item => {
                          const isChecked = (order.checkedItems || []).includes(item.name);
                          return (
                            <div key={item.id} onClick={() => handleKdsToggleItemCheck(order.id, item.name)} className="flex justify-between items-center border-b border-gray-100 pb-2 cursor-pointer">
                              <span className={`text-sm font-black uppercase ${isChecked ? 'line-through text-gray-300' : 'text-gray-900'}`}>{item.qty} {item.name}</span>
                              {isChecked ? <CheckSquare className="w-5 h-5 text-green-600" /> : <Square className="w-5 h-5 text-gray-300" />}
                            </div>
                          );
                        })}
                      </div>
                      <div className="p-4 pt-0">
                        {order.status === 'PREPARING'
                          ? <button onClick={() => handleUpdateOrderStatus(order.id, 'READY')} className="w-full bg-[#ff6b00] text-white font-black text-sm py-3 rounded-lg shadow active:scale-95 flex items-center justify-center gap-1.5"><CheckCircle className="w-4 h-4" />MARK AS READY</button>
                          : <button onClick={() => handleUpdateOrderStatus(order.id, 'PREPARING')} className="w-full bg-[#ff6b00] text-white font-black text-xs py-3 rounded-lg shadow active:scale-95">ACCEPT / START PREPARING</button>}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== ORDER DETAILS ====== */}
        {activeScreen === 'order-details' && selectedOrderId && (() => {
          const order = orders.find(o => o.id === selectedOrderId);
          if (!order) return <p className="text-center py-12 text-sm text-gray-500">Order not found.</p>;
          return (
            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e2bfb0]/20 flex items-start gap-4">
                <div className="bg-[#fed3c7]/60 p-3 rounded-xl flex-shrink-0"><Utensils className="w-5 h-5 text-[#795950]" /></div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-sm">{order.customerName}</h3>
                  <p className="text-xs text-gray-500 font-semibold mt-1">{order.customerAddress}</p>
                  <a href={`tel:${order.customerPhone}`} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#cee5ff]/20 hover:bg-[#cee5ff]/40 border border-[#cee5ff] rounded-full text-[10px] font-black text-[#004a75]">
                    <Phone className="w-3 h-3" />Call {order.customerName}
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-100/50 border border-green-200/50 p-3 rounded-xl flex items-center justify-center gap-2 text-green-800"><CheckCircle className="w-4 h-4 animate-pulse" /><span className="text-[10px] font-black uppercase">Paid Online</span></div>
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center justify-center gap-2 text-blue-800"><ShoppingBag className="w-4 h-4" /><span className="text-[10px] font-black uppercase">{order.status === 'COMPLETED' ? 'Handed Over' : 'Assigning Rider'}</span></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-[#e2bfb0]/35 overflow-hidden divide-y divide-gray-100">
                {order.items.map(item => (
                  <div key={item.id} className="p-3 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-gray-100">
                        <img className="w-full h-full object-cover" src={(item as any).image || FALLBACK_IMG} alt={item.name} />
                      </div>
                      <div>
                        <span className="font-extrabold text-xs text-[#1c1b1f]">{item.name}</span>
                        <span className="block text-[10px] text-gray-500 font-bold mt-0.5">Qty: {item.qty}</span>
                      </div>
                    </div>
                    <span className="font-black text-xs text-[#a04100]">₹{item.price * item.qty}</span>
                  </div>
                ))}
              </div>
              <div className="bg-white p-4 rounded-xl border border-dashed border-[#e2bfb0]/60 shadow-sm">
                <div className="flex justify-between text-xs text-gray-500 font-semibold mb-1.5"><span>Subtotal</span><span>₹{order.subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-xs text-gray-500 font-semibold mb-1.5"><span>GST (5%)</span><span>₹{order.taxes.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm font-black text-[#a04100] pt-2 border-t border-gray-100"><span>Total</span><span>₹{order.total.toFixed(2)}</span></div>
              </div>
              {order.note && (
                <div className="bg-[#ff6b00]/5 p-3.5 rounded-xl border border-[#ff6b00]/15 flex gap-2.5">
                  <span className="material-symbols-outlined text-[#ff6b00]" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
                  <div><h5 className="text-[9px] font-black text-[#ff6b00] uppercase tracking-wider">Note</h5><p className="text-[11px] text-gray-600 mt-0.5">"{order.note}"</p></div>
                </div>
              )}
              <div className="mt-3">
                {order.status === 'NEW' && <button onClick={() => { handleUpdateOrderStatus(order.id, 'PREPARING'); setActiveScreen('orders'); }} className="w-full bg-[#ff6b00] text-white py-4 rounded-xl font-bold text-xs shadow flex items-center justify-center gap-1.5 active:scale-95"><Utensils className="w-5 h-5" />START PREPARING</button>}
                {order.status === 'PREPARING' && <button onClick={() => { handleUpdateOrderStatus(order.id, 'READY'); setActiveScreen('orders'); }} className="w-full bg-[#ff6b00] text-white py-4 rounded-xl font-bold text-xs shadow flex items-center justify-center gap-1.5 active:scale-95"><CheckCircle className="w-5 h-5" />MARK AS READY</button>}
                {order.status === 'READY' && <button onClick={() => { handleUpdateOrderStatus(order.id, 'COMPLETED'); setActiveScreen('orders'); }} className="w-full bg-green-700 text-white py-4 rounded-xl font-bold text-xs shadow flex items-center justify-center gap-1.5 active:scale-95"><CheckCircle className="w-5 h-5" />HANDOVER TO RIDER</button>}
              </div>
            </div>
          );
        })()}

        {/* ====== MENU ====== */}
        {activeScreen === 'menu' && (
          <div className="flex flex-col gap-4">

            {/* Online / POS toggle */}
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold tracking-tight text-[#1c1b1f]">Menu Management</h2>
              <div className="flex bg-[#f1ecf2] p-1 rounded-xl border border-gray-200 shadow-inner w-full">
                <button
                  onClick={() => { setMenuType('online'); setCategoryFilter('All'); setSearchQuery(''); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${menuType === 'online' ? 'bg-[#ff6b00] text-white shadow' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <Wifi className="w-3.5 h-3.5" />Online Menu
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black ${menuType === 'online' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>{onlineItems.length}</span>
                </button>
                <button
                  onClick={() => { setMenuType('pos'); setCategoryFilter('All'); setSearchQuery(''); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${menuType === 'pos' ? 'bg-[#a04100] text-white shadow' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />POS Menu
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black ${menuType === 'pos' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>{posItems.length}</span>
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative w-full">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={`Search ${menuType === 'online' ? 'online' : 'POS'} menu...`} className="w-full pl-11 pr-4 py-3 bg-white border border-[#e2bfb0]/35 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#ff6b00] outline-none shadow-sm" />
            </div>

            {/* Category chips — dynamically from Firestore */}
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
              <span className="text-[10px] text-gray-500 font-bold">{getDisplayedItems().length} items</span>
            </div>

            {/* Empty state */}
            {getDisplayedItems().length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-[#e2bfb0]/40 p-12 text-center shadow-sm">
                <p className="text-xs text-gray-500 font-bold mb-1">No items found</p>
                <p className="text-[10px] text-gray-400">{activeMenuItems.length === 0 ? `The ${menuType === 'online' ? 'products' : 'posProducts'} collection is empty in Firebase` : 'Try a different search or category'}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {getDisplayedItems().map(item => (
                <article key={item.id} className={`bg-white p-3.5 rounded-xl border border-gray-100 flex items-center justify-between shadow-sm hover:border-[#e2bfb0]/50 transition-all ${!item.inStock ? 'opacity-75' : ''}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-50 border border-gray-100 relative">
                      <img className="w-full h-full object-cover" src={item.image || FALLBACK_IMG} alt={item.name} onError={e => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }} />
                      {!item.inStock && <div className="absolute inset-0 bg-black/45 flex items-center justify-center"><span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>block</span></div>}
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

        {/* ====== SETTINGS ====== */}
        {activeScreen === 'settings' && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-[#1c1b1f]">Vendor Workspace Console</h2>
              <span className="text-[10px] text-gray-500 font-semibold tracking-widest uppercase">System operations</span>
            </div>
            <div className="bg-white border border-[#e2bfb0]/35 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest border-b border-gray-100 pb-2">Store Status</h3>
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-bold text-gray-800 block text-sm">Store is <span className={storeOpen ? 'text-green-600' : 'text-gray-400'}>{storeOpen ? 'OPEN' : 'CLOSED'}</span></span>
                  <span className="text-[10px] text-gray-400">{storeOpen ? 'Accepting new orders' : 'New orders paused'}</span>
                </div>
                <button onClick={toggleStoreOpen} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow ${storeOpen ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
                  <Power className="w-4 h-4" />{storeOpen ? 'Open' : 'Closed'}
                </button>
              </div>
            </div>
            <div className="bg-white border border-[#e2bfb0]/35 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <h3 className="text-xs font-black text-[#ff6b00] uppercase tracking-widest border-b border-gray-100 pb-2">Order Alert Simulation</h3>
              <p className="text-xs text-gray-600">Trigger a mock incoming order to test the alert popup.</p>
              <button onClick={triggerSimulation} className="w-full bg-[#ff6b00]/10 border border-[#ff6b00]/25 text-[#ff6b00] font-black text-xs py-3 rounded-lg hover:bg-[#ff6b00]/15 active:scale-95 uppercase tracking-wider">PRODUCE POPUP ALERT</button>
            </div>
            <div className="bg-white border border-[#e2bfb0]/35 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest border-b border-gray-100 pb-2">Sound Control</h3>
              <div className="flex justify-between items-center text-xs">
                <div><span className="font-bold text-gray-800 block">Alert sounds</span><span className="text-gray-400 text-[10px]">Ping on new orders</span></div>
                <button onClick={() => setSoundEnabled(!soundEnabled)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${soundEnabled ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-gray-100 text-gray-400'}`}>{soundEnabled ? 'Active' : 'Muted'}</button>
              </div>
            </div>
            <div className="bg-white border border-[#e2bfb0]/35 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <h3 className="text-xs font-black text-[#ba1a1a] uppercase tracking-widest border-b border-gray-100 pb-2">Reset Data</h3>
              <p className="text-xs text-gray-600">Wipe local state back to defaults.</p>
              <button onClick={handleResetData} className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs py-2.5 rounded-lg font-black active:scale-95 uppercase tracking-wider">RESTORE DEFAULTS</button>
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM NAV */}
      <footer className="fixed bottom-0 left-0 w-full flex justify-around items-center px-1 pb-3 pt-2 bg-white border-t border-[#e2bfb0]/35 z-50 shadow-[0_-10px_25px_rgba(0,0,0,0.035)]">
        {[
          { screen: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
          { screen: 'orders', icon: 'receipt_long', label: 'Orders' },
          { screen: 'menu', icon: 'restaurant_menu', label: 'Menu' },
          { screen: 'settings', icon: 'settings', label: 'Settings' },
        ].map(({ screen, icon, label }) => {
          const isActive = activeScreen === screen || (screen === 'orders' && activeScreen === 'order-details');
          return (
            <button key={screen} onClick={() => { setActiveScreen(screen as ScreenType); setSelectedOrderId(null); }} className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all active:scale-90 ${isActive ? 'bg-[#fed3c7]/50 text-[#795950]' : 'text-gray-400'}`}>
              <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: `'FILL' ${isActive ? '1' : '0'}` }}>{icon}</span>
              <span className="text-[9px] font-black uppercase tracking-widest font-mono">{label}</span>
            </button>
          );
        })}
      </footer>

      {/* MODALS */}
      {simulatedOrderOverlay && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-start justify-center pt-24 px-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-[#e2bfb0]/60 order-card-pulse">
            <div className="p-3.5 bg-[#ff6b00] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-white/20 p-2 rounded-full"><Utensils className="w-5 h-5 animate-bounce" /></div>
                <p className="font-extrabold text-xs tracking-wider uppercase">New Online Order</p>
              </div>
              <span className="font-black text-base font-mono">O025!</span>
            </div>
            <div className="p-5 flex flex-col">
              <div className="flex justify-between items-start mb-5 gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <p className="font-extrabold text-[9px] text-gray-400 uppercase tracking-widest mb-1">Items</p>
                  {simulatedOrderOverlay.items.map(item => <p key={item.id} className="font-black text-sm text-gray-800">{item.qty}x {item.name}</p>)}
                </div>
                <div className="text-right">
                  <span className="font-bold text-[9px] text-gray-400 uppercase">Amount</span>
                  <span className="font-black text-2xl text-[#a04100] block">₹{simulatedOrderOverlay.total}</span>
                </div>
              </div>
              {!storeOpen && (
                <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[10px] text-amber-700 font-bold flex items-center gap-1.5">
                  <Power className="w-3 h-3" />Store is closed — accepting will reopen it
                </div>
              )}
              <div className="flex gap-4">
                <button onClick={() => setSimulatedOrderOverlay(null)} className="flex-1 py-2.5 rounded-xl border border-[#8e7164] text-[#5a4136] text-[11px] font-bold hover:bg-gray-50">Dismiss</button>
                <button onClick={handleAcceptSimulated} className="flex-1 py-2.5 rounded-xl bg-[#ff6b00] text-white text-[11px] font-black shadow active:scale-95">ACCEPT</button>
              </div>
            </div>
          </div>
        </div>
      )}

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