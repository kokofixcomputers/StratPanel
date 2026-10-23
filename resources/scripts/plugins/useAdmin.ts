import { useStoreState } from '@/state/hooks';
import { adminUrl, allowed, AdminPageInfo } from '@/lib/adminNav';

/** What the signed in person may do in the admin area. Root admins may do everything. */
export default () => {
    const root = useStoreState((state) => !!state.user.data?.rootAdmin);
    const permissions = useStoreState((state) => state.user.data?.adminPermissions || []);

    return {
        root,
        permissions,
        /** Whether any one of these permissions is held ('root' is for root admins only). */
        can: (...wanted: string[]): boolean =>
            wanted.includes('root') ? root : root || wanted.some((permission) => permissions.includes(permission)),
        canOpen: (page: Pick<AdminPageInfo, 'permissions'>): boolean => allowed(page, permissions, root),
        url: adminUrl,
    };
};
