/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  Store, 
  Bell, 
  Rocket, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  MapPin, 
  CheckCircle, 
  Search, 
  Plus, 
  Phone, 
  Clock, 
  Utensils, 
  X, 
  Edit2, 
  ArrowLeft,
  Volume2,
  VolumeX,
  CheckSquare,
  Square,
  ShoppingCart,
  CalendarDays
} from 'lucide-react';
import { ScreenType, Order, MenuItem, OrderStatus, KitchenStats } from './types';
import { INITIAL_MENU_ITEMS, INITIAL_ORDERS } from './initialData';
import { db } from './firebase';
import { 
  collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc 
} from 'firebase/firestore';

type DateFilter = 'today' | 'yesterday' | 'month';

export default function App() {
  // --- Persistent States ---
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // Real-time orders listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'orders'), (snapshot) => {
      if (snapshot.empty) {
        INITIAL_ORDERS.forEach(order => {
          setDoc(doc(db, 'orders', order.id), order);
        });
      } else {
        setOrders(snapshot.docs.map(d => ({ ...d.data() as Order })));
      }
    });
    return () => unsub();
  }, []);

  // Real-time menu listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'menuItems'), (snapshot) => {
      if (snapshot.empty) {
        INITIAL_MENU_ITEMS.forEach(item => {
          setDoc(doc(db, 'menuItems', item.id), item);
        });
      } else {
        setMenuItems(snapshot.docs.map(d => ({ ...d.data() as MenuItem })));
      }
    });
    return () => unsub();
  }, []);

  const [activeScreen, setActiveScreen] = useState<ScreenType>(() => {
    const saved = localStorage.getItem('aromas_screen');
    return (saved as ScreenType) || 'dashboard';
  });

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => {
    return localStorage.getItem('aromas_selected_order_id') || null;
  });

  const [ordersTab, setOrdersTab] = useState<OrderStatus>(() => {
    const saved = localStorage.getItem('aromas_orders_tab');
    return (saved as OrderStatus) || 'NEW';
  });

  const [kdsMode, setKdsMode] = useState<boolean>(() => {
    return localStorage.getItem('aromas_kds_mode') === 'true';
  });

  const [restaurantOpen, setRestaurantOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('aromas_restaurant_open');
    return saved !== 'false';
  });

  // Dashboard date filter
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');

  // --- UI Filter & Action States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [menuFilter, setMenuFilter] = useState<'All Items' | 'Popular' | 'Main Course' | 'Breads'>('All Items');
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [editPriceValue, setEditPriceValue] = useState<number>(0);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Main Course');
  const [newItemImage, setNewItemImage] = useState('');

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([
    'New Online Order O023 received!',
    'Rider assigned for Order O100',
    'Kitchen peak hour warnings: Check inventory!'
  ]);

  const [simulatedOrderOverlay, setSimulatedOrderOverlay] = useState<Order | null>(null);

  // --- Sync storage ---
  useEffect(() => { localStorage.setItem('aromas_screen', activeScreen); }, [activeScreen]);
  useEffect(() => {
    if (selectedOrderId) localStorage.setItem('aromas_selected_order_id', selectedOrderId);
    else localStorage.removeItem('aromas_selected_order_id');
  }, [selectedOrderId]);
  useEffect(() => { localStorage.setItem('aromas_orders_tab', ordersTab); }, [ordersTab]);
  useEffect(() => { localStorage.setItem('aromas_kds_mode', String(kdsMode)); }, [kdsMode]);
  useEffect(() => { localStorage.setItem('aromas_restaurant_open', String(restaurantOpen)); }, [restaurantOpen]);

  // --- Date filter helpers ---
  const getDateBounds = (filter: DateFilter): { start: Date; end: Date } => {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    if (filter === 'today') {
      return { start: startOfDay(now), end: endOfDay(now) };
    } else if (filter === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    } else {
      // This month
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
        end: endOfDay(now)
      };
    }
  };

  const getFilteredOrders = (filter: DateFilter) => {
    const { start, end } = getDateBounds(filter);
    return orders.filter(o => {
      const t = new Date(o.createdAt).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });
  };

  const getFilteredStats = (filter: DateFilter) => {
    const filtered = getFilteredOrders(filter);
    const orderCount = filtered.length;
    const revenue = filtered
      .filter(o => o.status === 'COMPLETED')
      .reduce((sum, o) => sum + o.total, 0);

    // Add baseline revenue for "today" to simulate a real dashboard
    const baselineRevenue = filter === 'today' ? 12450 : filter === 'yesterday' ? 9870 : 87340;
    const totalRevenue = Math.round(baselineRevenue + revenue);

    // Baseline order counts
    const baselineOrders = filter === 'today' ? 38 : filter === 'yesterday' ? 31 : 284;
    const totalOrders = baselineOrders + orderCount;

    return { orderCount: totalOrders, revenue: totalRevenue };
  };

  const filteredStats = getFilteredStats(dateFilter);

  const filterLabels: Record<DateFilter, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    month: 'This Month'
  };

  const playAlertSound = () => {
    if (!soundEnabled) return;
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.connect(gain);
      gain.connect(context.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, context.currentTime);
      osc.frequency.setValueAtTime(880, context.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.4);
      osc.start();
      osc.stop(context.currentTime + 0.4);
    } catch (e) {}
  };

  const triggerSimulation = () => {
    playAlertSound();
    const mockOrderOverlay: Order = {
      id: 'O025',
      customerName: 'Aishwarya Roy',
      customerPhone: '+91 95432 12345',
      customerAddress: 'Hostel 11, Room 403, IIT Campus',
      status: 'NEW',
      type: 'ONLINE',
      time: 'Just Now',
      createdAt: new Date().toISOString(),
      note: 'Deliver before class starting. Extra spicy Masala Dosa!',
      items: [
        { id: 'm7', name: 'Masala Dosa', category: 'Main Course', price: 95, qty: 2, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAx86ESO3YSutZK8zu9BSLA6dIf3tBnz8y-6jJoZ9YODkPphHN0s2nCdp_2zC2kBkdbHu6kubnG6GYCIMEvXTl1tfXGm_t0F78VL-E9yT_gkacw6sJzBBkdch6x8z8zLYxVGd1nmQhgjzf8M8IYLEAnAiY8CeXPiezY0HTVvNI-6naCZeNgno8JebH-ftydKwwdLmPASsel2R-FrZ4w879xNzwjmW2JMRy_xD3F0WzM3Oai_1eixf48fkHAN8qZx7wcW5nAHfQ-CYk' },
        { id: 'm8', name: 'Filter Coffee', category: 'Breads', price: 20, qty: 1, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCpfzzN1F-pxAYrfvYLjZdFbYtIfsN65wUGCH-CusCyEZWCy6OjMCwUqfbpAEn13ejo1qjDKf9akiuiT0-HdryATZzingXb87koXpi7c5rhD358AWPr1GJsZmh-jVMzcodOIekD5lUFCCMYmne5L3oP7VMHnlpr2nM2mc6-fRwKmSLZAKC6yc-IHV5NkFfQUPFbVEqKOilehkzLJ8XLPTF0M7JtFw1f1zBFwBNL3rviuM09l12m3GsevrBOXmgg8kP4JwFKM2er2iE' }
      ],
      subtotal: 210,
      taxes: 10.50,
      total: 220.50,
      checkedItems: []
    };
    setSimulatedOrderOverlay(mockOrderOverlay);
  };

  const handleAcceptSimulated = () => {
    if (!simulatedOrderOverlay) return;
    const acceptedOrder: Order = { ...simulatedOrderOverlay, status: 'PREPARING' };
    setOrders(prev => [acceptedOrder, ...prev]);
    setNotifications(prev => [`Accepted Order #${simulatedOrderOverlay.id} instantly!`, ...prev]);
    setSimulatedOrderOverlay(null);
    setOrdersTab('PREPARING');
    setActiveScreen('orders');
  };

  const handleUpdateOrderStatus = async (id: string, newStatus: OrderStatus) => {
    const orderRef = doc(db, 'orders', id);
    const order = orders.find(o => o.id === id);
    if (order) {
      // If this order only exists in local state (e.g. simulated), write it first
      await setDoc(orderRef, { ...order, status: newStatus, time: 'Just Now' }, { merge: true });
    } else {
      await updateDoc(orderRef, { status: newStatus, time: 'Just Now' });
    }
    setNotifications(prev => [`Order #${id} status updated to ${newStatus}`, ...prev]);
  };

  const handleKdsToggleItemCheck = (orderId: string, itemName: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        const checked = o.checkedItems || [];
        const isChecked = checked.includes(itemName);
        const updatedChecked = isChecked ? checked.filter(c => c !== itemName) : [...checked, itemName];
        return { ...o, checkedItems: updatedChecked };
      }
      return o;
    }));
  };

  const handleResetData = () => {
    if (window.confirm('Reset kitchen dashboard configuration?')) {
      setOrders(INITIAL_ORDERS);
      setMenuItems(INITIAL_MENU_ITEMS);
      setActiveScreen('dashboard');
      setSelectedOrderId(null);
      setOrdersTab('NEW');
      setRestaurantOpen(true);
      setNotifications(['Dashboard database reset to default definitions.', 'Initial orders restored.']);
    }
  };

  const getStats = (): KitchenStats => {
    const activeCount = orders.filter(o => o.status === 'PREPARING' || o.status === 'NEW').length;
    const pendingCount = orders.filter(o => o.status === 'NEW').length;
    const completedCount = orders.filter(o => o.status === 'COMPLETED').length + 142;
    const queueCount = orders.filter(o => o.status === 'PREPARING').length;
    const interactiveRevenue = orders.filter(o => o.status === 'COMPLETED').reduce((sum, o) => sum + o.total, 0);
    const todayRevenue = 12450 + Math.round(interactiveRevenue);
    return { activeCount, pendingCount, completedCount, queueCount, todayRevenue };
  };

  const stats = getStats();

  const getFilteredMenuItems = () => {
    return menuItems.filter(item => {
      if (menuFilter !== 'All Items' && item.category !== menuFilter && !(menuFilter === 'Popular' && item.isPopular)) return false;
      return item.name.toLowerCase().includes(searchQuery.toLowerCase());
    });
  };

  const handleToggleStock = async (id: string) => {
    const item = menuItems.find(i => i.id === id);
    if (!item) return;
    const nextStock = !item.inStock;
    await updateDoc(doc(db, 'menuItems', id), { inStock: nextStock });
    setNotifications(p => [`${item.name} is now ${nextStock ? 'IN STOCK' : 'OUT OF STOCK'}.`, ...p]);
  };

  const handleStartEditPrice = (item: MenuItem) => {
    setEditingMenuItem(item);
    setEditPriceValue(item.price);
  };

  const handleSavePrice = async () => {
    if (!editingMenuItem) return;
    await updateDoc(doc(db, 'menuItems', editingMenuItem.id), { price: editPriceValue });
    setNotifications(prev => [`Updated price of ${editingMenuItem.name} to ₹${editPriceValue}`, ...prev]);
    setEditingMenuItem(null);
  };

  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) { alert('Please state product name and price.'); return; }
    const newItem: MenuItem = {
      id: 'm_' + Date.now(),
      name: newItemName,
      price: Number(newItemPrice),
      category: newItemCategory,
      inStock: true,
      image: newItemImage || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDQzP3RZ3dHe0ylfjfhS3XmYxqi52RBJ30XHHwDCfHD3wUsBGCPwLogbP8QNUbjBT2uypxRNhynnA96afhxbC2rxeMqeRLii8giRK18KzOQOy1sJmAbXO4IQDU0ErrAA1XFdj0RHStGHcce8LOl3-gcsVN7cyUbxEpDA_y8DYAbHBz9fuc2vvj5avcDIQOkE9G6wlvJfy--F4UZXQUW8tMx8M9MgEsx5KrHzUMfB8z-Ob_q3NDcUESPdDQ-htRmWnG5dEwAyF5CrVU',
    };
    await setDoc(doc(db, 'menuItems', newItem.id), newItem);
    setNotifications(prev => [`New menu item ${newItemName} added successfully.`, ...prev]);
    setNewItemName(''); setNewItemPrice(''); setNewItemCategory('Main Course'); setNewItemImage('');
    setIsAddingItem(false);
  };

  const viewOrderDetails = (orderId: string) => {
    setSelectedOrderId(orderId);
    setActiveScreen('order-details');
  };

  const backFromOrderDetails = () => {
    setActiveScreen('orders');
    setSelectedOrderId(null);
  };

  return (
    <div className="bg-[#fdf8fd] text-[#1c1b1f] font-sans min-h-screen relative pb-24 md:pb-28">
      {/* TOP APP NAVIGATION BAR */}
      <header className="bg-white sticky top-0 border-b border-[#e2bfb0]/30 shadow-sm z-40">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            {activeScreen === 'order-details' ? (
              <button onClick={backFromOrderDetails} className="p-1.5 hover:bg-[#f1ecf2] rounded-full active:scale-95 transition-transform text-[#a04100] mr-1">
                <ArrowLeft className="w-5.5 h-5.5" />
              </button>
            ) : (
              <Store className="w-6 h-6 text-[#a04100]" />
            )}
            <div className="flex flex-col">
              <h1 className="text-base md:text-lg font-bold text-[#a04100] tracking-tight">
                {activeScreen === 'order-details' ? `Order #${selectedOrderId} (Details)` : 'Aromas Dhaba'}
              </h1>
              {activeScreen === 'order-details' && (
                <span className="text-[10px] font-medium text-[#5a4136]/70 uppercase tracking-widest leading-none">KITCHEN SYSTEM</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(activeScreen === 'orders' || activeScreen === 'order-details') && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-[#cee5ff] text-[#001d32] border border-[#96ccff] rounded-full text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 text-[#004a75]" />
                <span>AVG 12M</span>
              </div>
            )}

            <button onClick={triggerSimulation} className="text-[10px] hidden md:flex items-center gap-1 bg-[#ff6b00]/10 hover:bg-[#ff6b00]/20 border border-[#ff6b00]/30 text-[#ff6b00] px-3 py-1.5 rounded-full font-bold active:scale-95 transition-all">
              <Rocket className="w-3 h-3" />
              SIMULATE ORDER
            </button>

            <button
              onClick={() => {
                setRestaurantOpen(!restaurantOpen);
                setNotifications(prev => [`Restaurant is now marked ${!restaurantOpen ? 'OPEN' : 'CLOSED'}!`, ...prev]);
              }}
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 ${restaurantOpen ? 'bg-[#ff6b00] text-white hover:brightness-105' : 'bg-gray-400 text-white hover:bg-gray-500'}`}
            >
              {restaurantOpen ? 'OPEN' : 'CLOSED'}
            </button>

            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)} className="p-1.5 relative hover:bg-[#f1ecf2] rounded-full active:scale-95 transition-transform text-[#5a4136]">
                <Bell className="w-5.5 h-5.5" />
                {notifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-[#ba1a1a] text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{notifications.length}</span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-[#e2bfb0]/40 rounded-xl shadow-xl z-50 overflow-hidden text-xs">
                  <div className="p-2.5 bg-[#f7f2f8] border-b border-[#e2bfb0]/20 flex justify-between items-center font-bold text-[#5a4136]">
                    <span>Real-time Workspace Feed</span>
                    <button onClick={() => setNotifications([])} className="text-[#a04100] underline">Clear</button>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">No active alerts</div>
                    ) : (
                      notifications.map((notif, i) => <div key={i} className="p-2.5 text-[11.5px] hover:bg-[#fdf8fd]">{notif}</div>)
                    )}
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

      {/* MAIN RENDER CONTAINER */}
      <main className="max-w-4xl mx-auto px-4 pt-5 flex flex-col gap-5">

        {/* ===================== SCREEN A: DASHBOARD ===================== */}
        {activeScreen === 'dashboard' && (
          <div className="flex flex-col gap-5">

            {/* Header */}
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-[#1c1b1f] tracking-tight leading-tight">
                Aromas Vendor Dashboard
              </h2>
              <p className="text-xs text-[#5a4136]/80 font-medium mt-0.5">
                Manage your kitchen operations and sales efficiently.
              </p>
            </div>

            {/* Date Filter Pills */}
            <div className="flex gap-2">
              {(['today', 'yesterday', 'month'] as DateFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                    dateFilter === f
                      ? 'bg-[#a04100] text-white shadow-md'
                      : 'bg-[#f1ecf2] text-[#5a4136] hover:bg-[#e5e1e7]'
                  }`}
                >
                  <CalendarDays className="w-3 h-3" />
                  {filterLabels[f]}
                </button>
              ))}
            </div>

            {/* Orders + Revenue cards for the selected period */}
            <div className="grid grid-cols-2 gap-3">
              {/* Revenue Card */}
              <div className="bg-white border border-[#e2bfb0]/30 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-[#5a4136]/70">
                  <DollarSign className="w-4 h-4 text-[#a04100]" />
                  <span className="text-[10px] font-black tracking-wider uppercase">Revenue</span>
                </div>
                <div>
                  <span className="text-2xl font-extrabold text-[#a04100]">
                    ₹{filteredStats.revenue.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#ff6b00]">
                  <TrendingUp className="w-3 h-3" />
                  <span>
                    {dateFilter === 'today' ? '+12% vs yesterday' : dateFilter === 'yesterday' ? '+8% vs prev day' : '+18% vs last month'}
                  </span>
                </div>
              </div>

              {/* Orders Card */}
              <div className="bg-white border border-[#e2bfb0]/30 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-[#5a4136]/70">
                  <ShoppingCart className="w-4 h-4 text-[#a04100]" />
                  <span className="text-[10px] font-black tracking-wider uppercase">Orders</span>
                </div>
                <div>
                  <span className="text-2xl font-extrabold text-[#1c1b1f]">
                    {filteredStats.orderCount}
                  </span>
                </div>
                <div className="text-[10px] font-bold text-[#5a4136]/60">
                  {filterLabels[dateFilter]}
                </div>
              </div>
            </div>

            {/* Divider label */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#e2bfb0]/30" />
              <span className="text-[9px] font-black tracking-widest text-[#5a4136]/40 uppercase">Live Status</span>
              <div className="flex-1 h-px bg-[#e2bfb0]/30" />
            </div>

            {/* Live Order Status Tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div
                className="bg-[#fff3ed] border border-[#ff6b00]/20 p-3 rounded-xl flex flex-col justify-between cursor-pointer hover:border-[#ff6b00]/50 transition-all"
                onClick={() => { setActiveScreen('orders'); setOrdersTab('NEW'); }}
              >
                <span className="text-[9px] font-extrabold text-[#ff6b00]/80 uppercase">New</span>
                <span className="text-2xl font-bold text-[#ff6b00]">{orders.filter(o => o.status === 'NEW').length}</span>
              </div>

              <div
                className="bg-[#fdf3e7] border border-[#a04100]/20 p-3 rounded-xl flex flex-col justify-between cursor-pointer hover:border-[#a04100]/40 transition-all"
                onClick={() => { setActiveScreen('orders'); setOrdersTab('PREPARING'); }}
              >
                <span className="text-[9px] font-extrabold text-[#a04100]/80 uppercase">Preparing</span>
                <span className="text-2xl font-bold text-[#a04100]">{orders.filter(o => o.status === 'PREPARING').length}</span>
              </div>

              <div
                className="bg-[#edf4ff] border border-blue-200 p-3 rounded-xl flex flex-col justify-between cursor-pointer hover:border-blue-400 transition-all"
                onClick={() => { setActiveScreen('orders'); setOrdersTab('READY'); }}
              >
                <span className="text-[9px] font-extrabold text-blue-500 uppercase">Ready</span>
                <span className="text-2xl font-bold text-blue-600">{orders.filter(o => o.status === 'READY').length}</span>
              </div>

              <div
                className="bg-[#edfaf0] border border-green-200 p-3 rounded-xl flex flex-col justify-between cursor-pointer hover:border-green-400 transition-all"
                onClick={() => { setActiveScreen('orders'); setOrdersTab('COMPLETED'); }}
              >
                <span className="text-[9px] font-extrabold text-green-600 uppercase">Done</span>
                <span className="text-2xl font-bold text-green-700">{stats.completedCount}</span>
              </div>
            </div>

            {/* View Live Orders CTA */}
            <button
              onClick={() => { setActiveScreen('orders'); setOrdersTab('NEW'); }}
              className="w-full bg-[#ff6b00] text-white py-4 rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <Rocket className="w-5 h-5 animate-bounce" />
              <span className="font-bold text-sm tracking-widest uppercase">View Live Orders</span>
            </button>

          </div>
        )}

        {/* ===================== SCREEN B: ORDERS ===================== */}
        {activeScreen === 'orders' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#1c1b1f]">Operational Matrix</h2>
                <p className="text-[10px] text-gray-500 font-black tracking-widest uppercase">Order Dispatch Control</p>
              </div>
              <div className="bg-[#f1ecf2] p-1 rounded-xl flex shadow-inner border border-gray-200">
                <button onClick={() => setKdsMode(false)} className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${!kdsMode ? 'bg-[#a04100] text-white shadow' : 'text-gray-500 hover:text-gray-900'}`}>Standard List</button>
                <button onClick={() => setKdsMode(true)} className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${kdsMode ? 'bg-[#a04100] text-white shadow' : 'text-gray-500 hover:text-gray-900'}`}>Kitchen KDS</button>
              </div>
            </div>

            {!kdsMode && (
              <nav className="flex overflow-x-auto border-b border-[#e2bfb0]/20 bg-white shadow-sm rounded-xl no-scrollbar">
                {(['NEW', 'PREPARING', 'READY', 'COMPLETED'] as OrderStatus[]).map((tab) => {
                  const count = orders.filter(o => o.status === tab).length;
                  const isActive = ordersTab === tab;
                  const textColors = { NEW: 'text-[#ff6b00]', PREPARING: 'text-[#a04100]', READY: 'text-blue-600', COMPLETED: 'text-green-700' };
                  return (
                    <button key={tab} onClick={() => setOrdersTab(tab)} className={`flex-1 py-3 px-1 flex flex-col items-center justify-center font-bold tracking-widest text-[10px] border-b-2 uppercase transition-all ${isActive ? 'border-[#a04100] text-[#a04100] bg-[#a04100]/5' : 'border-transparent text-gray-500 hover:text-[#5a4136]'}`}>
                      <span>{tab}</span>
                      <span className={`text-[9px] font-extrabold mt-0.5 ${textColors[tab]}`}>({tab === 'COMPLETED' ? count + 142 : count})</span>
                    </button>
                  );
                })}
              </nav>
            )}

            {!kdsMode ? (
              <div className="flex flex-col gap-4">
                {orders.filter(o => o.status === ordersTab).length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-[#e2bfb0]/40 p-12 text-center shadow-sm">
                    <p className="text-xs text-gray-500 font-bold mb-2">No active orders found in {ordersTab.toLowerCase()}</p>
                    <button onClick={triggerSimulation} className="bg-[#ff6b00] text-white rounded-full text-xs font-bold px-4 py-2 shadow">Produce Incoming Diner Alert</button>
                  </div>
                ) : (
                  orders.filter(o => o.status === ordersTab).map((order) => (
                    <article key={order.id} className="bg-white rounded-xl border-2 order-card-pulse shadow-sm overflow-hidden flex flex-col hover:border-[#ff6b00]/50 transition-all">
                      <div className="p-4 flex justify-between items-start border-b border-[#e2bfb0]/25 bg-[#f7f2f8]">
                        <div>
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black inline-flex items-center gap-1 mb-1 ${order.type === 'ONLINE' ? 'bg-[#cee5ff] text-[#001d32]' : 'bg-gray-150 text-[#5a4136]'}`}>
                            <span className="material-symbols-outlined text-[12px]">{order.type === 'ONLINE' ? 'language' : 'shopping_bag'}</span>
                            {order.type === 'ONLINE' ? 'Online Order' : 'Takeaway (Offline)'}
                          </span>
                          <h3 className="font-bold text-sm tracking-tight text-[#1c1b1f]">Order #{order.id}</h3>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-sm text-[#a04100]">₹{order.total}</span>
                          <p className="text-[9px] text-gray-400 font-bold mt-0.5">{order.time}</p>
                        </div>
                      </div>
                      <div className="p-4 flex-grow flex flex-col">
                        <div className="flex flex-col gap-1.5 border-b border-gray-100 pb-3">
                          {order.items.map((item) => (
                            <div key={item.id} className="text-xs font-semibold text-gray-800 flex justify-between">
                              <span><span className="font-extrabold text-[#ff6b00] mr-2">{item.qty}x</span>{item.name}</span>
                            </div>
                          ))}
                        </div>
                        <div className="pt-3 flex gap-2 items-start text-[11px] text-gray-500">
                          {order.type === 'ONLINE' ? (
                            <><MapPin className="w-3.5 h-3.5 text-[#a04100] flex-shrink-0 mt-0.5" /><span className="font-semibold text-gray-600">{order.customerAddress}</span></>
                          ) : (
                            <><ShoppingBag className="w-3.5 h-3.5 text-[#ff6b00] flex-shrink-0 mt-0.5" /><span className="font-semibold text-gray-600">Self Takeaway Pick-up</span></>
                          )}
                        </div>
                      </div>
                      <div className="p-4 pt-0 bg-white flex gap-3">
                        <button onClick={() => viewOrderDetails(order.id)} className="px-4 py-2 border border-[#8e7164] text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-bold active:scale-95 transition-all">Details</button>
                        {order.status === 'NEW' && (
                          <>
                            <button onClick={() => handleUpdateOrderStatus(order.id, 'PREPARING')} className="flex-1 bg-[#ff6b00] text-white py-2 rounded-lg text-xs font-black shadow active:scale-95 transition-all">Accept</button>
                            <button onClick={async () => { if (window.confirm('Reject order ' + order.id + '?')) { await deleteDoc(doc(db, 'orders', order.id)); } }} className="px-3 py-2 border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg text-xs active:scale-95 transition-all">Reject</button>
                          </>
                        )}
                        {order.status === 'PREPARING' && <button onClick={() => handleUpdateOrderStatus(order.id, 'READY')} className="flex-1 bg-[#a04100] text-white py-2 rounded-lg text-xs font-black shadow active:scale-95 transition-all">Mark Ready</button>}
                        {order.status === 'READY' && <button onClick={() => handleUpdateOrderStatus(order.id, 'COMPLETED')} className="flex-1 bg-green-700 text-white py-2 rounded-lg text-xs font-black shadow flex items-center justify-center gap-1.5 active:scale-95 transition-all"><CheckCircle className="w-4 h-4" />Handover to Rider</button>}
                      </div>
                    </article>
                  ))
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <div className="bg-white p-3 rounded-xl shadow-sm border border-[#e2bfb0]/30 flex flex-col items-center"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active</span><span className="text-2xl font-black text-[#ff6b00]">{"08"}</span></div>
                  <div className="bg-white p-3 rounded-xl shadow-sm border border-[#e2bfb0]/30 flex flex-col items-center"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pending</span><span className="text-2xl font-black text-blue-600">{"02"}</span></div>
                  <div className="bg-white p-3 rounded-xl shadow-sm border border-[#e2bfb0]/30 flex flex-col items-center font-bold text-gray-500"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Completed</span><span className="text-2xl font-black">{"142"}</span></div>
                  <div className="bg-white p-3 rounded-xl shadow-sm border border-[#e2bfb0]/30 flex flex-col items-center text-[#ba1a1a]"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Queue</span><span className="text-2xl font-black">{"03"}</span></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {orders.filter(o => o.status === 'PREPARING' || o.status === 'NEW').length === 0 ? (
                    <div className="col-span-2 bg-white rounded-xl border border-dashed border-[#e2bfb0]/40 p-12 text-center shadow">
                      <p className="text-xs text-gray-500 font-bold mb-1">No pending preparation orders in queue.</p>
                      <button onClick={triggerSimulation} className="bg-[#ff6b00] text-white rounded-full text-xs font-bold px-4 py-2 mt-2 shadow">Trigger simulation</button>
                    </div>
                  ) : (
                    orders.filter(o => o.status === 'PREPARING' || o.status === 'NEW').map((order) => {
                      const isPreparing = order.status === 'PREPARING';
                      return (
                        <section key={order.id} className="bg-white border-2 border-[#e2bfb0]/40 rounded-xl flex flex-col overflow-hidden shadow-md">
                          <div className={`p-4 flex justify-between items-center ${order.type === 'ONLINE' ? 'bg-[#cee5ff] text-[#001d32]' : 'bg-[#fed3c7] text-[#795950]'}`}>
                            <div>
                              <div className="flex items-center gap-1 text-[10px] font-black tracking-widest">
                                <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>{order.type === 'ONLINE' ? 'language' : 'takeout_dining'}</span>
                                <span>{order.type === 'ONLINE' ? 'ONLINE ORDER' : 'TAKEAWAY'}</span>
                              </div>
                              <h4 className="font-extrabold text-lg mt-0.5">{order.id}</h4>
                            </div>
                            <div className="text-right flex flex-col items-end">
                              <span className="font-bold text-xs">14:20 PM</span>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-[#ff6b00] text-white mt-1">{order.status}</span>
                            </div>
                          </div>
                          <div className="p-4 flex-grow flex flex-col gap-2.5">
                            {order.items.map((item) => {
                              const isChecked = (order.checkedItems || []).includes(item.name);
                              return (
                                <div key={item.id} onClick={() => handleKdsToggleItemCheck(order.id, item.name)} className="flex justify-between items-start border-b border-gray-100 pb-2 cursor-pointer hover:bg-[#fdf8fd]/60 active:scale-[0.99] transition-all">
                                  <span className={`text-sm font-black uppercase ${isChecked ? 'line-through text-gray-300' : 'text-gray-900'}`}>{item.qty} {item.name}</span>
                                  <button className="text-[#a04100]">{isChecked ? <CheckSquare className="w-5.5 h-5.5 text-green-600" /> : <Square className="w-5.5 h-5.5 text-gray-300" />}</button>
                                </div>
                              );
                            })}
                          </div>
                          <div className="p-4 pt-0">
                            {isPreparing ? (
                              <button onClick={() => handleUpdateOrderStatus(order.id, 'READY')} className="w-full bg-[#ff6b00] text-white font-black text-sm py-3 rounded-lg shadow hover:brightness-105 active:scale-95 transition-all flex items-center justify-center gap-1.5"><CheckCircle className="w-4 h-4" />MARK AS READY</button>
                            ) : (
                              <button onClick={() => handleUpdateOrderStatus(order.id, 'PREPARING')} className="w-full bg-[#ff6b00] text-white font-black text-xs py-3 rounded-lg shadow active:scale-100">ACCEPT ORDER / START PREPARATION</button>
                            )}
                          </div>
                        </section>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== SCREEN C: ORDER DETAILS ===================== */}
        {activeScreen === 'order-details' && selectedOrderId && (
          <div className="flex flex-col gap-4">
            {(() => {
              const order = orders.find(o => o.id === selectedOrderId);
              if (!order) return <p className="text-center py-12 text-sm text-gray-500">Retrieval error.</p>;
              const isPreparing = order.status === 'PREPARING';
              const isNew = order.status === 'NEW';
              const isReady = order.status === 'READY';
              return (
                <>
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e2bfb0]/20 flex items-start gap-4">
                    <div className="bg-[#fed3c7]/60 p-3 rounded-xl text-[#795950] flex-shrink-0"><Utensils className="w-5.5 h-5.5" /></div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 text-sm mb-0.5 leading-none">{order.customerName}</h3>
                      <p className="text-xs text-gray-500 font-semibold leading-tight mt-1.5">{order.customerAddress}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <a href={`tel:${order.customerPhone}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#cee5ff]/20 hover:bg-[#cee5ff]/40 border border-[#cee5ff] rounded-full text-[10px] font-black text-[#004a75]">
                          <Phone className="w-3 h-3" /><span>Call: {order.customerName}</span>
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-100/50 border border-green-200/50 p-3 rounded-xl flex items-center justify-center gap-2 text-green-800"><CheckCircle className="w-4 h-4 text-green-700 animate-pulse" /><span className="text-[10px] font-black uppercase tracking-wider">Paid Online</span></div>
                    <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center justify-center gap-2 text-blue-800"><ShoppingBag className="w-4 h-4 text-blue-700" /><span className="text-[10px] font-black uppercase tracking-wider">{order.status === 'COMPLETED' ? 'Handed Over' : 'Assigning Rider'}</span></div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <h4 className="text-xs font-black tracking-widest text-gray-500 uppercase px-1">Order Items ({order.items.length})</h4>
                    <div className="bg-white rounded-xl shadow-sm border border-[#e2bfb0]/35 overflow-hidden divide-y divide-gray-100">
                      {order.items.map((item) => {
                        const fallbackImage = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDQzP3RZ3dHe0ylfjfhS3XmYxqi52RBJ30XHHwDCfHD3wUsBGCPwLogbP8QNUbjBT2uypxRNhynnA96afhxbC2rxeMqeRLii8giRK18KzOQOy1sJmAbXO4IQDU0ErrAA1XFdj0RHStGHcce8LOl3-gcsVN7cyUbxEpDA_y8DYAbHBz9fuc2vvj5avcDIQOkE9G6wlvJfy--F4UZXQUW8tMx8M9MgEsx5KrHzUMfB8z-Ob_q3NDcUESPdDQ-htRmWnG5dEwAyF5CrVU';
                        return (
                          <div key={item.id} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-lg bg-gray-150 overflow-hidden flex-shrink-0 border border-gray-100"><img className="w-full h-full object-cover" src={item.image || fallbackImage} alt={item.name} /></div>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5"><span className="text-[9px] bg-red-100 text-red-600 px-1 rounded-sm font-black font-mono">■</span><span className="font-extrabold text-xs text-[#1c1b1f] leading-tight">{item.name}</span></div>
                                <span className="text-[10px] text-gray-500 font-bold mt-1 leading-none">Qty: {item.qty}</span>
                              </div>
                            </div>
                            <span className="font-black text-xs text-[#a04100]">₹{item.price * item.qty}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-dashed border-[#e2bfb0]/60 shadow-sm">
                    <div className="flex justify-between text-xs text-gray-500 font-semibold mb-1.5"><span>Subtotal</span><span>₹{order.subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-xs text-gray-500 font-semibold mb-1.5"><span>GST Taxes & Service Charges (5%)</span><span>₹{order.taxes.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm font-black text-[#a04100] pt-2 border-t border-gray-100 mt-2"><span>Total Amount Paid</span><span>₹{order.total.toFixed(2)}</span></div>
                  </div>
                  {order.note && (
                    <div className="bg-[#ff6b00]/5 p-3.5 rounded-xl border border-[#ff6b00]/15 flex gap-2.5">
                      <span className="material-symbols-outlined text-[#ff6b00]" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
                      <div><h5 className="text-[9px] font-black text-[#ff6b00] uppercase tracking-wider">Note from Customer</h5><p className="text-[11px] text-gray-600 mt-0.5 leading-snug">"{order.note}"</p></div>
                    </div>
                  )}
                  <div className="mt-3">
                    {isNew && <button onClick={() => { handleUpdateOrderStatus(order.id, 'PREPARING'); setActiveScreen('orders'); }} className="w-full bg-[#ff6b00] text-white h-13 rounded-xl font-bold uppercase tracking-wider text-xs shadow flex items-center justify-center gap-1.5 active:scale-95 transition-all"><Utensils className="w-5 h-5" />START PREPARING</button>}
                    {isPreparing && <button onClick={() => { handleUpdateOrderStatus(order.id, 'READY'); setActiveScreen('orders'); }} className="w-full bg-[#ff6b00] text-white h-13 rounded-xl font-bold uppercase tracking-wider text-xs shadow flex items-center justify-center gap-1.5 active:scale-95 transition-all"><CheckCircle className="w-5 h-5" />MARK AS READY / DISPATCH</button>}
                    {isReady && <button onClick={() => { handleUpdateOrderStatus(order.id, 'COMPLETED'); setActiveScreen('orders'); }} className="w-full bg-green-700 text-white h-13 rounded-xl font-bold uppercase tracking-wider text-xs shadow flex items-center justify-center gap-1.5 active:scale-95 transition-all"><CheckCircle className="w-5 h-5" />HANDOVER TO RIDER</button>}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ===================== SCREEN D: MENU ===================== */}
        {activeScreen === 'menu' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <div className="relative w-full">
                <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search menu dishes..." className="w-full pl-11 pr-4 py-3 bg-white border border-[#e2bfb0]/35 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#ff6b00] outline-none transition-all shadow-sm" />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {(['All Items', 'Popular', 'Main Course', 'Breads'] as const).map((cat) => (
                  <button key={cat} onClick={() => setMenuFilter(cat)} className={`px-4 py-2 font-black text-xs rounded-full transition-all shadow-sm ${menuFilter === cat ? 'bg-[#ff6b00] text-white' : 'bg-[#f1ecf2] text-[#5a4136] hover:bg-[#e5e1e7]'}`}>{cat}</button>
                ))}
              </div>
            </div>
            <div className="flex justify-between items-end px-1">
              <h2 className="text-base font-black tracking-wider text-[#1c1b1f] uppercase">{menuFilter}</h2>
              <span className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">{getFilteredMenuItems().length} Dishes Listed</span>
            </div>
            <div className="flex flex-col gap-2">
              {getFilteredMenuItems().map((item) => {
                const fallbackImage = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDQzP3RZ3dHe0ylfjfhS3XmYxqi52RBJ30XHHwDCfHD3wUsBGCPwLogbP8QNUbjBT2uypxRNhynnA96afhxbC2rxeMqeRLii8giRK18KzOQOy1sJmAbXO4IQDU0ErrAA1XFdj0RHStGHcce8LOl3-gcsVN7cyUbxEpDA_y8DYAbHBz9fuc2vvj5avcDIQOkE9G6wlvJfy--F4UZXQUW8tMx8M9MgEsx5KrHzUMfB8z-Ob_q3NDcUESPdDQ-htRmWnG5dEwAyF5CrVU';
                return (
                  <article key={item.id} className={`bg-white p-3.5 rounded-xl border border-gray-100 flex items-center justify-between shadow-sm hover:border-[#e2bfb0]/50 transition-all ${!item.inStock ? 'opacity-85' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-50 border border-gray-100 shadow-inner relative">
                        <img className="w-full h-full object-cover" src={item.image || fallbackImage} alt={item.name} />
                        {!item.inStock && <div className="absolute inset-0 bg-black/45 flex items-center justify-center"><span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>block</span></div>}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-extrabold text-sm text-[#1c1b1f] leading-tight">{item.name}</h4>
                          {!item.inStock && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider">Out of stock</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="font-bold text-[#ff6b00] text-sm">₹{item.price}</span>
                          <button onClick={() => handleStartEditPrice(item)} className="bg-[#cee5ff]/20 text-[#00639a] p-1 rounded hover:bg-[#cee5ff]/40 transition-all active:scale-90"><Edit2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => handleToggleStock(item.id)} className={`w-11 h-6 rounded-full relative p-0.5 transition-colors focus:outline-none ${item.inStock ? 'bg-[#ff6b00]' : 'bg-gray-300'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-150 ease-in-out ${item.inStock ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </article>
                );
              })}
            </div>
            <button onClick={() => setIsAddingItem(true)} className="fixed bottom-24 right-5 w-14 h-14 bg-[#ff6b00] hover:scale-105 active:scale-95 text-white rounded-full shadow-2xl flex items-center justify-center z-40 transition-all"><Plus className="w-8 h-8 font-bold" /></button>
          </div>
        )}

        {/* ===================== SCREEN E: SETTINGS ===================== */}
        {activeScreen === 'settings' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#1c1b1f]">Vendor Workspace Console</h2>
              <span className="text-[10px] text-gray-500 font-semibold tracking-widest uppercase font-mono">System operations settings</span>
            </div>
            <div className="bg-white border border-[#e2bfb0]/35 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <h3 className="text-xs font-black text-[#ff6b00] uppercase tracking-widest border-b border-gray-100 pb-2">Diner Order Alert simulation</h3>
              <p className="text-xs text-gray-600 leading-snug">Mock trigger a Diner placing an Online Order O025 (Masala Dosa, Filter Coffee) to inspect the high-alert popup warning frame overlay.</p>
              <button onClick={triggerSimulation} className="w-full bg-[#ff6b00]/10 border border-[#ff6b00]/25 text-[#ff6b00] font-black text-xs py-3 rounded-lg hover:bg-[#ff6b00]/15 active:scale-95 transition-transform uppercase tracking-wider">PRODUCE NEW POPUP WINDOW ALERT OVERLAY</button>
            </div>
            <div className="bg-white border border-[#e2bfb0]/35 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest border-b border-gray-100 pb-2">Sound Synth control</h3>
              <div className="flex justify-between items-center text-xs">
                <div><span className="font-bold text-gray-800 block">Workspace alert rings</span><span className="text-gray-400 text-[10px]">Ping sound when simulated orders drop</span></div>
                <button onClick={() => setSoundEnabled(!soundEnabled)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${soundEnabled ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-gray-100 text-gray-400'}`}>{soundEnabled ? 'Synthesizer Active' : 'Sound Muted'}</button>
              </div>
            </div>
            <div className="bg-white border border-[#e2bfb0]/35 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <h3 className="text-xs font-black text-[#ba1a1a] uppercase tracking-widest border-b border-gray-100 pb-2">Workspace Database wipes</h3>
              <p className="text-xs text-gray-600">Wipe clean local storage state to baseline defaults.</p>
              <button onClick={handleResetData} className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs py-2.5 rounded-lg font-black active:scale-95 transition-all text-center uppercase tracking-wider">RESTORE baseline Demo defaults</button>
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM NAVIGATION */}
      <footer className="fixed bottom-0 left-0 w-full flex justify-around items-center px-1 pb-3 pt-2 bg-white border-t border-[#e2bfb0]/35 z-50 shadow-[0_-10px_25px_rgba(0,0,0,0.035)]">
        <button onClick={() => { setActiveScreen('dashboard'); setSelectedOrderId(null); }} className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all duration-150 active:scale-90 ${activeScreen === 'dashboard' ? 'bg-[#fed3c7]/50 text-[#795950]' : 'text-gray-400'}`}>
          <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: ` 'FILL' ${activeScreen === 'dashboard' ? '1' : '0'}` }}>dashboard</span>
          <span className="text-[9px] font-black uppercase tracking-widest font-mono">Dashboard</span>
        </button>
        <button onClick={() => { setActiveScreen('orders'); setSelectedOrderId(null); }} className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all duration-150 active:scale-90 ${activeScreen === 'orders' || activeScreen === 'order-details' ? 'bg-[#fed3c7]/50 text-[#795950]' : 'text-gray-400'}`}>
          <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: ` 'FILL' ${activeScreen === 'orders' ? '1' : '0'}` }}>receipt_long</span>
          <span className="text-[9px] font-black uppercase tracking-widest font-mono">Orders</span>
        </button>
        <button onClick={() => { setActiveScreen('menu'); setSelectedOrderId(null); }} className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all duration-150 active:scale-90 ${activeScreen === 'menu' ? 'bg-[#fed3c7]/50 text-[#795950]' : 'text-gray-400'}`}>
          <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: ` 'FILL' ${activeScreen === 'menu' ? '1' : '0'}` }}>restaurant_menu</span>
          <span className="text-[9px] font-black uppercase tracking-widest font-mono">Menu</span>
        </button>
        <button onClick={() => { setActiveScreen('settings'); setSelectedOrderId(null); }} className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all duration-150 active:scale-90 ${activeScreen === 'settings' ? 'bg-[#fed3c7]/50 text-[#795950]' : 'text-gray-400'}`}>
          <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: ` 'FILL' ${activeScreen === 'settings' ? '1' : '0'}` }}>settings</span>
          <span className="text-[9px] font-black uppercase tracking-widest font-mono">Settings</span>
        </button>
      </footer>

      {/* MODALS */}
      {simulatedOrderOverlay && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-start justify-center pt-24 px-4 overflow-y-auto">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-[#e2bfb0]/60 animate-slide-in order-card-pulse">
            <div className="p-3.5 bg-[#ff6b00] text-white flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <div className="bg-white/20 p-2 rounded-full"><Utensils className="w-5 h-5 text-white animate-bounce" /></div>
                <p className="font-extrabold text-xs tracking-wider uppercase text-white">New Online Order</p>
              </div>
              <span className="font-black text-white text-base font-mono">O025!</span>
            </div>
            <div className="p-5 flex flex-col">
              <div className="flex justify-between items-start mb-5 gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <p className="font-extrabold text-[9px] text-gray-400 uppercase tracking-widest mb-1 leading-none">Dish Items</p>
                  {simulatedOrderOverlay.items.map((item) => <p key={item.id} className="font-black text-sm text-gray-800 leading-snug">{item.qty}x {item.name}</p>)}
                </div>
                <div className="text-right">
                  <span className="font-bold text-[9px] text-gray-400 uppercase tracking-widest block leading-none">Amount</span>
                  <span className="font-black text-2xl text-[#a04100]">₹{simulatedOrderOverlay.total}</span>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setSimulatedOrderOverlay(null)} className="flex-1 py-2.5 text-center rounded-xl border border-[#8e7164] text-[#5a4136] text-[11px] font-bold hover:bg-gray-50 active:scale-95 transition-transform">VIEW</button>
                <button onClick={handleAcceptSimulated} className="flex-1 py-2.5 text-center rounded-xl bg-[#ff6b00] text-white text-[11px] font-black shadow active:scale-95 transition-transform hover:brightness-105">ACCEPT</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingMenuItem && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 border border-gray-150 shadow-xl flex flex-col gap-3.5">
            <h3 className="text-xs font-black text-[#5a4136] uppercase tracking-widest border-b border-gray-100 pb-2">Edit Price: {editingMenuItem.name}</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-black text-gray-400 uppercase">New Price Indicator (₹)</label>
              <input type="number" value={editPriceValue} onChange={(e) => setEditPriceValue(Number(e.target.value))} className="px-3.5 py-2.5 border border-[#e2bfb0]/35 rounded-xl outline-none font-bold text-sm text-[#a04100]" />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditingMenuItem(null)} className="flex-1 py-2.5 text-center border border-[#8e7164] text-[#1c1b1f] text-xs font-bold rounded-lg">Cancel</button>
              <button type="button" onClick={handleSavePrice} className="flex-1 py-2.5 text-center bg-[#ff6b00] text-white text-xs font-bold rounded-lg">Save tag</button>
            </div>
          </div>
        </div>
      )}

      {isAddingItem && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddNewItem} className="bg-white rounded-2xl w-full max-w-sm p-4 border border-gray-150 shadow-xl flex flex-col gap-3.5">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="text-xs font-black text-[#a04100] uppercase tracking-widest">Add Menu Dish</h3>
              <button type="button" onClick={() => setIsAddingItem(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-gray-400 uppercase">Item Name</label>
                <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="e.g. Masala Paneer" className="px-3.5 py-2.5 border border-[#e2bfb0]/35 rounded-xl outline-none text-xs font-bold text-gray-800" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-gray-400 uppercase">Price tag (₹)</label>
                <input type="number" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} placeholder="e.g. 150" className="px-3.5 py-2.5 border border-[#e2bfb0]/35 rounded-xl outline-none text-xs font-bold text-gray-800" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-gray-400 uppercase">Category</label>
                <select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} className="px-3.5 py-2.5 border border-[#e2bfb0]/35 rounded-xl outline-none text-xs font-bold text-gray-800 bg-white">
                  <option value="Main Course">Main Course</option>
                  <option value="Breads">Breads</option>
                  <option value="Popular">Popular Category</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-gray-400 uppercase">Image URL (Optional)</label>
                <input type="text" value={newItemImage} onChange={(e) => setNewItemImage(e.target.value)} placeholder="Paste dish photo link..." className="px-3.5 py-2.5 border border-[#e2bfb0]/35 rounded-xl outline-none text-xs font-bold text-gray-800" />
              </div>
            </div>
            <button type="submit" className="w-full bg-[#ff6b00] text-white py-2.5 rounded-xl text-xs font-black shadow active:scale-95 transition-all mt-2 uppercase tracking-wide">Add New item</button>
          </form>
        </div>
      )}
    </div>
  );
}