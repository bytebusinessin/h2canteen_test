/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ScreenType = 'dashboard' | 'orders' | 'history' | 'menu' | 'settings' | 'order-details';

export type OrderType = 'ONLINE' | 'TAKEAWAY' | 'OFFLINE';

export type OrderStatus = 'NEW' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  name: string;
  category: string;
  price: number;
  qty: number;
  image?: string;
}

export interface Order {
  id: string;
  orderId?: string;     // friendly ID e.g. "O-26060008" from Firestore doc
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: OrderItem[];
  subtotal: number;
  taxes: number;
  total: number;
  status: OrderStatus;
  type: OrderType;
  time: string; // display timestamp or relative time
  createdAt: string; // real Timestamp ISO String
  note?: string;
  checkedItems?: string[]; // item exact names or IDs checked off in Kitchen view
  rawData?: any;        // full raw Firestore doc for payment details etc.
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
  image: string;
  isPopular?: boolean;
}

export interface KitchenStats {
  activeCount: number;
  pendingCount: number;
  completedCount: number;
  queueCount: number;
  todayRevenue: number;
}
