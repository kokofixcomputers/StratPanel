import React, { useEffect } from 'react';
import { Link, RouteComponentProps } from 'react-router-dom';
import login from '@/api/auth/login';
import LoginFormContainer from '@/components/auth/LoginFormContainer';
import { useStoreState } from 'easy-peasy';
import { Formik, FormikHelpers } from 'formik';
import { object, string } from 'yup';
import Field from '@/components/elements/Field';
import tw from 'twin.macro';
import Button from '@/components/elements/Button';
import useFlash from '@/plugins/useFlash';
import Captcha, { useCaptcha } from '@/components/auth/Captcha';
import ProviderButtons from '@/components/auth/ProviderButtons';
import PasskeyButton from '@/components/auth/PasskeyButton';
import OrDivider from '@/components/auth/OrDivider';
import { authErrorMessage, queryParam } from '@/lib/authProviders';

interface Values {
    username: string;
    password: string;
}

const LoginContainer = ({ history, location }: RouteComponentProps) => {
    const captcha = useCaptcha();
    const { clearFlashes, addFlash, clearAndAddHttpError } = useFlash();
    const auth = useStoreState((state) => state.settings.data!.auth);
    const hasAlternatives = !!auth && (auth.passkeys || auth.providers.length > 0);

    useEffect(() => {
        clearFlashes();

        // Coming back from another service that did not sign us in.
        const message = authErrorMessage(queryParam(location.search, 'error'));
        if (message) addFlash({ type: 'error', title: 'Error', message });
    }, []);

    const onSubmit = (values: Values, { setSubmitting }: FormikHelpers<Values>) => {
        clearFlashes();

        captcha
            .run()
            .then((token) => login({ ...values, captcha: token }))
            .then((response) => {
                if (response.complete) {
                    // @ts-expect-error this is valid
                    window.location = response.intended || '/';
                    return;
                }

                history.replace('/auth/login/checkpoint', { token: response.confirmationToken });
            })
            .catch((error) => {
                console.error(error);

                captcha.reset();
                setSubmitting(false);
                clearAndAddHttpError({ error });
            });
    };

    return (
        <Formik
            onSubmit={onSubmit}
            initialValues={{ username: '', password: '' }}
            validationSchema={object().shape({
                username: string().required('A username or email must be provided.'),
                password: string().required('Please enter your account password.'),
            })}
        >
            {({ isSubmitting }) => (
                <LoginFormContainer
                    title={'Welcome back'}
                    subtitle={'Sign in to manage your servers.'}
                    css={tw`w-full flex`}
                >
                    <Field light type={'text'} label={'Username or Email'} name={'username'} disabled={isSubmitting} />
                    <div css={tw`mt-6`}>
                        <Field light type={'password'} label={'Password'} name={'password'} disabled={isSubmitting} />
                    </div>
                    <div css={tw`mt-6`}>
                        <Button type={'submit'} size={'xlarge'} isLoading={isSubmitting} disabled={isSubmitting}>
                            Login
                        </Button>
                    </div>
                    <Captcha ref={captcha.ref} />
                    {hasAlternatives && (
                        <>
                            <OrDivider />
                            <div className={'space-y-2'}>
                                <PasskeyButton />
                                <ProviderButtons />
                            </div>
                        </>
                    )}
                    <div css={tw`mt-6 text-center`}>
                        <Link
                            to={'/auth/password'}
                            css={tw`text-sm text-primary-600 font-medium no-underline hover:text-primary-700`}
                        >
                            Forgot password?
                        </Link>
                    </div>
                    {auth?.registration && (
                        <div css={tw`mt-3 text-center text-sm text-neutral-400`}>
                            No account yet?&nbsp;
                            <Link
                                to={'/auth/register'}
                                css={tw`text-primary-600 font-medium no-underline hover:text-primary-700`}
                            >
                                Create one
                            </Link>
                        </div>
                    )}
                </LoginFormContainer>
            )}
        </Formik>
    );
};

export default LoginContainer;
