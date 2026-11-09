import http, { FractalResponseData } from '@/api/http';
import { Subuser } from '@/state/server/subusers';

export const rawDataToServerSubuser = (data: FractalResponseData): Subuser => ({
    uuid: data.attributes.uuid,
    username: data.attributes.username,
    email: data.attributes.email,
    image: data.attributes.image,
    minecraft: data.attributes.minecraft
        ? { uuid: data.attributes.minecraft.uuid, username: data.attributes.minecraft.username }
        : null,
    twoFactorEnabled: data.attributes['2fa_enabled'],
    createdAt: new Date(data.attributes.created_at),
    permissions: data.attributes.permissions || [],
    can: (permission) => (data.attributes.permissions || []).indexOf(permission) >= 0,
});

export interface ServerUsers {
    // The owner of the server: not a subuser, so there is nothing to change or remove (permissions are all of them).
    owner: Subuser | null;
    subusers: Subuser[];
}

export default (uuid: string): Promise<ServerUsers> => {
    return new Promise((resolve, reject) => {
        http.get(`/api/client/servers/${uuid}/users`)
            .then(({ data }) =>
                resolve({
                    owner: data.owner
                        ? rawDataToServerSubuser({
                              ...data.owner,
                              attributes: { ...data.owner.attributes, permissions: ['*'] },
                          })
                        : null,
                    subusers: (data.data || []).map(rawDataToServerSubuser),
                })
            )
            .catch(reject);
    });
};
