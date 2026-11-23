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

export interface StoreOrder {
    id: string;
    package: string;
    kind: 'server' | 'box';
    amount: number;
    currency: string;
    provider: string;
    status: 'pending' | 'paid' | 'canceled' | 'failed' | 'refunded';
    renewal: boolean;
    // Paid, and waiting for what was bought to be made.
    setting_up: boolean;
    problem: string | null;
    box: string | null;
    server: string | null;
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

/** Starts a payment, the answer is where to send the person. `target` renews a box or a server they have. */
export const checkout = async (
    pkg: string,
    provider: string,
    target?: { box?: string; server?: string }
): Promise<string> => (await http.post('/api/client/store/checkout', { package: pkg, provider, ...target })).data.url;

/** Asks the panel what became of a payment (it asks the payment service). */
export const confirmOrder = async (order: string): Promise<StoreOrder> =>
    (await http.post(`/api/client/store/orders/${order}/confirm`)).data;
