/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MenuItem, Order } from './types';

export const INITIAL_MENU_ITEMS: MenuItem[] = [
  {
    id: 'm1',
    name: 'Paneer Butter Masala',
    price: 180,
    category: 'Main Course',
    inStock: true,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDQzP3RZ3dHe0ylfjfhS3XmYxqi52RBJ30XHHwDCfHD3wUsBGCPwLogbP8QNUbjBT2uypxRNhynnA96afhxbC2rxeMqeRLii8giRK18KzOQOy1sJmAbXO4IQDU0ErrAA1XFdj0RHStGHcce8LOl3-gcsVN7cyUbxEpDA_y8DYAbHBz9fuc2vvj5avcDIQOkE9G6wlvJfy--F4UZXQUW8tMx8M9MgEsx5KrHzUMfB8z-Ob_q3NDcUESPdDQ-htRmWnG5dEwAyF5CrVU',
    isPopular: true
  },
  {
    id: 'm2',
    name: 'Veg Thali',
    price: 120,
    category: 'Main Course',
    inStock: false,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDgqgh1y_yoqGyfs9eVrTXAjOspF-PyH71IKJv9zO1h99ayEwnr7hIETkNc8j35vI9o6BmRDR6k9Nly3iL0JHDa8ZZ8hLLaDyJU7LSE-datxTzhcJlogfi5ho-VQNnLBSmzKaYeEL34eKmKlLEEualts-OiA8BGctYwXh3dwHZIM2M4d9Rv4P6PM04l8H_ezexKQ-0QJ6IGeXFFlAdJvxNHmcW5gdLp650bVqd5-wUYO3EW0euQqWWJdnyKDqNsFaFEgy1pbg-AIj4',
    isPopular: true
  },
  {
    id: 'm3',
    name: 'Dal Tadka',
    price: 90,
    category: 'Main Course',
    inStock: true,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuATvS1HgdL87Vl8zeV50spOHClKnXIyusYdVkWHjaghI-ZNpaR3Z6EE-IDi8DMIUf8QH27o3SztiZN0OjYcrl6FhrI_oiIjcr95a_i2kYLXaQdUUXgSdoMj-flp4WAEJKjP8gPUhLlK7n0RFCp2sv9c2AkBkdOJdrU4BVTaGkacyiC-FFcra5utrSUdKXwTDy9T9NJyUuLLhFiMKfnKejOfdwGJZGITsy7Ws0BVpmz7sxzaVbGNBp4QPKS8aUyNS1Io2bjwWdhQFmE',
    isPopular: true
  },
  {
    id: 'm4',
    name: 'Butter Naan',
    price: 40,
    category: 'Breads',
    inStock: true,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCgljGu_jFvkDCjDX_N15XpGASkGVADnZDCD1RuWP1Hl4ifZEeY1LRTvM8SBUF5y8Fb6-6f8PhR_5FIoC8GwBb1IiFYDGQP3NMBUoFmr7QiyyIsF3zx_TOl137VeE3wNTK40mJ9EeSu4L2J2tieVmUTcRTiX3iwiJLiZXphG0DGBUkFKTJ44LOBvMHH0ZH3vFV7m_R0epj83YftaAlS_HMBo7e6kDYrHiV4OM6ELk7VaswxZNUj59SjibuBfUpDMCNSoAfQRzrocn0',
    isPopular: true
  },
  {
    id: 'm5',
    name: 'Paneer Tikka Masala',
    price: 250,
    category: 'Main Course',
    inStock: true,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAx86ESO3YSutZK8zu9BSLA6dIf3tBnz8y-6jJoZ9YODkPphHN0s2nCdp_2zC2kBkdbHu6kubnG6GYCIMEvXTl1tfXGm_t0F78VL-E9yT_gkacw6sJzBBkdch6x8z8zLYxVGd1nmQhgjzf8M8IYLEAnAiY8CeXPiezY0HTVvNI-6naCZeNgno8JebH-ftydKwwdLmPASsel2R-FrZ4w879xNzwjmW2JMRy_xD3F0WzM3Oai_1eixf48fkHAN8qZx7wcW5nAHfQ-CYk',
    isPopular: false
  },
  {
    id: 'm6',
    name: 'Jeera Rice',
    price: 120,
    category: 'Main Course',
    inStock: true,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBL3NDMFJLW1tm4jzZnvscMLtm1srXfHsnx8jl6zSoRYXgfciA3Kj3FPEi85yd3bdOQLWmh9BLEA0sDL1AUNNOkx0-1a1mAalbcu2MN5Ro32bTs_eGfPn0Petp1ZFULkm0T6aJLhpk8n7jN1gEvz4ADD7QOAV_ZWeKx7XOw8sL-jLMRHYUCzbJ0IyRiHWqSAHpF8AYAktgKCwbhB4ty583hktvyzeqzGcQRpYJIiXjzRmvKS_BEq4KmXUeF0_vcKF3jk8cOD6j274U',
    isPopular: false
  },
  {
    id: 'm7',
    name: 'Masala Dosa',
    price: 95,
    category: 'Main Course',
    inStock: true,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAx86ESO3YSutZK8zu9BSLA6dIf3tBnz8y-6jJoZ9YODkPphHN0s2nCdp_2zC2kBkdbHu6kubnG6GYCIMEvXTl1tfXGm_t0F78VL-E9yT_gkacw6sJzBBkdch6x8z8zLYxVGd1nmQhgjzf8M8IYLEAnAiY8CeXPiezY0HTVvNI-6naCZeNgno8JebH-ftydKwwdLmPASsel2R-FrZ4w879xNzwjmW2JMRy_xD3F0WzM3Oai_1eixf48fkHAN8qZx7wcW5nAHfQ-CYk',
    isPopular: false
  },
  {
    id: 'm8',
    name: 'Filter Coffee',
    price: 20,
    category: 'Breads',
    inStock: true,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCpfzzN1F-pxAYrfvYLjZdFbYtIfsN65wUGCH-CusCyEZWCy6OjMCwUqfbpAEn13ejo1qjDKf9akiuiT0-HdryATZzingXb87koXpi7c5rhD358AWPr1GJsZmh-jVMzcodOIekD5lUFCCMYmne5L3oP7VMHnlpr2nM2mc6-fRwKmSLZAKC6yc-IHV5NkFfQUPFbVEqKOilehkzLJ8XLPTF0M7JtFw1f1zBFwBNL3rviuM09l12m3GsevrBOXmgg8kP4JwFKM2er2iE',
    isPopular: false
  }
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'O023',
    customerName: 'Rahul Sharma',
    customerPhone: '+91 98765 43210',
    customerAddress: 'Hostel 4, Room 202, IIT Campus, Powai',
    status: 'NEW',
    type: 'ONLINE',
    time: '2 mins ago',
    createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    note: 'Please make the Paneer Tikka extra spicy. No plastic cutlery needed.',
    items: [
      {
        id: 'm5',
        name: 'Paneer Tikka Masala',
        category: 'Main Course',
        price: 250,
        qty: 3,
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAx86ESO3YSutZK8zu9BSLA6dIf3tBnz8y-6jJoZ9YODkPphHN0s2nCdp_2zC2kBkdbHu6kubnG6GYCIMEvXTl1tfXGm_t0F78VL-E9yT_gkacw6sJzBBkdch6x8z8zLYxVGd1nmQhgjzf8M8IYLEAnAiY8CeXPiezY0HTVvNI-6naCZeNgno8JebH-ftydKwwdLmPASsel2R-FrZ4w879xNzwjmW2JMRy_xD3F0WzM3Oai_1eixf48fkHAN8qZx7wcW5nAHfQ-CYk'
      },
      {
        id: 'm4',
        name: 'Butter Naan',
        category: 'Breads',
        price: 40,
        qty: 2,
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCgljGu_jFvkDCjDX_N15XpGASkGVADnZDCD1RuWP1Hl4ifZEeY1LRTvM8SBUF5y8Fb6-6f8PhR_5FIoC8GwBb1IiFYDGQP3NMBUoFmr7QiyyIsF3zx_TOl137VeE3wNTK40mJ9EeSu4L2J2tieVmUTcRTiX3iwiJLiZXphG0DGBUkFKTJ44LOBvMHH0ZH3vFV7m_R0epj83YftaAlS_HMBo7e6kDYrHiV4OM6ELk7VaswxZNUj59SjibuBfUpDMCNSoAfQRzrocn0'
      },
      {
        id: 'm6',
        name: 'Jeera Rice',
        category: 'Main Course',
        price: 120,
        qty: 1,
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBL3NDMFJLW1tm4jzZnvscMLtm1srXfHsnx8jl6zSoRYXgfciA3Kj3FPEi85yd3bdOQLWmh9BLEA0sDL1AUNNOkx0-1a1mAalbcu2MN5Ro32bTs_eGfPn0Petp1ZFULkm0T6aJLhpk8n7jN1gEvz4ADD7QOAV_ZWeKx7XOw8sL-jLMRHYUCzbJ0IyRiHWqSAHpF8AYAktgKCwbhB4ty583hktvyzeqzGcQRpYJIiXjzRmvKS_BEq4KmXUeF0_vcKF3jk8cOD6j274U'
      }
    ],
    subtotal: 950.00,
    taxes: 47.50,
    total: 997.50,
    checkedItems: []
  },
  {
    id: 'O024',
    customerName: 'Pooja Mehra',
    customerPhone: '+91 87654 32109',
    customerAddress: 'Takeaway (Self Pick-up)',
    status: 'NEW',
    type: 'OFFLINE',
    time: '5 mins ago',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    note: 'Pack items separately, please.',
    items: [
      {
        id: 'm2',
        name: 'Veg Thali',
        category: 'Main Course',
        price: 120,
        qty: 1,
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDgqgh1y_yoqGyfs9eVrTXAjOspF-PyH71IKJv9zO1h99ayEwnr7hIETkNc8j35vI9o6BmRDR6k9Nly3iL0JHDa8ZZ8hLLaDyJU7LSE-datxTzhcJlogfi5ho-VQNnLBSmzKaYeEL34eKmKlLEEualts-OiA8BGctYwXh3dwHZIM2M4d9Rv4P6PM04l8H_ezexKQ-0QJ6IGeXFFlAdJvxNHmcW5gdLp650bVqd5-wUYO3EW0euQqWWJdnyKDqNsFaFEgy1pbg-AIj4'
      }
    ],
    subtotal: 120.00,
    taxes: 6.00,
    total: 126.00,
    checkedItems: []
  },
  {
    id: 'T114',
    customerName: 'Kabir Sen',
    customerPhone: '+91 76543 21098',
    customerAddress: 'Takeaway Counter B',
    status: 'PREPARING',
    type: 'TAKEAWAY',
    time: '12 mins ago',
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    items: [
      {
        id: 'd1',
        name: '1 DAL MAKHANI',
        category: 'Main Course',
        price: 180,
        qty: 1
      },
      {
        id: 'd2',
        name: '4 TANDOORI ROTI',
        category: 'Breads',
        price: 15,
        qty: 4
      },
      {
        id: 'd3',
        name: '1 BOONDI RAITA',
        category: 'Popular',
        price: 60,
        qty: 1
      }
    ],
    subtotal: 300.00,
    taxes: 15.00,
    total: 315.00,
    checkedItems: []
  },
  {
    id: 'O102',
    customerName: 'Amit Verma',
    customerPhone: '+91 93245 61122',
    customerAddress: 'Hostel 3, Room 105',
    status: 'NEW',
    type: 'ONLINE',
    time: '10 mins ago',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    items: [
      {
        id: 'm1',
        name: 'Paneer Butter Masala',
        category: 'Main Course',
        price: 180,
        qty: 1
      },
      {
        id: 'm4',
        name: 'Butter Naan',
        category: 'Breads',
        price: 60,
        qty: 1
      }
    ],
    subtotal: 240.00,
    taxes: 12.00,
    total: 252.00,
    checkedItems: []
  },
  {
    id: 'O101',
    customerName: 'Tina Patel',
    customerPhone: '+91 88554 43322',
    customerAddress: 'Staff Quarters, Flat 4B',
    status: 'PREPARING',
    type: 'ONLINE',
    time: '15 mins ago',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    items: [
      {
        id: 'm1',
        name: 'Paneer Butter Masala',
        category: 'Main Course',
        price: 180,
        qty: 3
      },
      {
        id: 'm4',
        name: 'Butter Naan',
        category: 'Breads',
        price: 40,
        qty: 2
      }
    ],
    subtotal: 620.00,
    taxes: 31.00,
    total: 651.00,
    checkedItems: []
  },
  {
    id: 'O100',
    customerName: 'Rohit Gupta',
    customerPhone: '+91 77665 54433',
    customerAddress: 'Hostel 1, Room 312',
    status: 'READY',
    type: 'ONLINE',
    time: '25 mins ago',
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    items: [
      {
        id: 'm2',
        name: 'Veg Thali',
        category: 'Main Course',
        price: 120,
        qty: 1
      }
    ],
    subtotal: 120.00,
    taxes: 6.00,
    total: 126.00,
    checkedItems: []
  }
];
