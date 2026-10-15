import { headUrl } from '@/lib/minecraft';

describe('headUrl', () => {
    it('asks for the size that mc-heads.net answers for, whatever size the head is shown at', () => {
        expect(headUrl('13bc7d5e-f906-41ff-a949-6c1eb677fe03')).toBe(
            'https://mc-heads.net/avatar/13bc7d5ef90641ffa9496c1eb677fe03/80'
        );
    });

    it('takes the dashes out of the uuid', () => {
        expect(headUrl('069a79f4-44e9-4726-a5be-fca90e38aaf5')).toBe(
            'https://mc-heads.net/avatar/069a79f444e94726a5befca90e38aaf5/80'
        );
    });
});
