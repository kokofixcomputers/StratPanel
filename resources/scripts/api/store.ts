import useSWR from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { Share } from '@/lib/store';

export interface StorePackage extends Share {
    id: string;
    name: string;
    description: string | null;
    kind: 'server' | 'box';
    price: number;
    // How many days one payment lasts, null: it is paid once.
    period_days: number | null;
}

export interface StoreState {
    open: boolean;
    currency: string;
    providers: { id: 'stripe' | 'paypal'; name: string }[];
    packages: StorePackage[];
}

export interface StoreOrderItem {
    name: string;
    kind: 'server' | 'box';
    amount: number;
    renewal: boolean;
    // Whether it was made (or renewed).
    done: boolean;
    box: string | null;
    server: string | null;
}

export interface StoreOrder {
    id: string;
    // What the order is called: the package, or "3 items".
    package: string;
    amount: number;
    currency: string;
    provider: string;
    status: 'pending' | 'paid' | 'canceled' | 'failed' | 'refunded';
    // Paid, and waiting for something to be made.
    setting_up: boolean;
    problem: string | null;
    items: StoreOrderItem[];
    paid_at: string | null;
    created_at: string | null;
}

export const useStore = () =>
    useSWR<StoreState, AxiosError>('store', async () => (await http.get('/api/client/store')).data, {
        revalidateOnFocus: false,
    });

export const useOrders = () =>
    useSWR<StoreOrder[], AxiosError>(
        'store:orders',
        async () => (await http.get('/api/client/store/orders')).data.data,
        {
            revalidateOnFocus: false,
        }
    );

export interface CheckoutItem {
    package: string;
    quantity?: number;
    // Renews a box or a server the person has, instead of buying another.
    box?: string;
    server?: string;
}

/** Starts a payment for the items, the answer is where to send the person. */
export const checkout = async (items: CheckoutItem[], provider: string): Promise<string> =>
    (await http.post('/api/client/store/checkout', { items, provider })).data.url;

/** Asks the panel what became of a payment (it asks the payment service). */
export const confirmOrder = async (order: string): Promise<StoreOrder> =>
    (await http.post(`/api/client/store/orders/${order}/confirm`)).data;
