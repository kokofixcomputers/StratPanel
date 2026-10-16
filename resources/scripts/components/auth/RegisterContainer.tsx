import React, { useEffect } from 'react';
import { Link, Redirect, RouteComponentProps } from 'react-router-dom';
import { Formik, FormikHelpers } from 'formik';
import { object, string } from 'yup';
import tw from 'twin.macro';
import { useStoreState } from 'easy-peasy';
import register from '@/api/auth/register';
import LoginFormContainer from '@/components/auth/LoginFormContainer';
import Field from '@/components/elements/Field';
import Button from '@/components/elements/Button';
import useFlash from '@/plugins/useFlash';
import Captcha, { useCaptcha } from '@/components/auth/Captcha';
import ProviderButtons from '@/components/auth/ProviderButtons';
import OrDivider from '@/components/auth/OrDivider';

interface Values {
    username: string;
    email: string;
    password: string;
    passwordConfirmation: string;
}

const USERNAME = /^[a-z0-9][\w.-]+[a-z0-9]$/i;

/** The sign up page: a username and password and/or the services that let new people in. Only exists when an admin allowed it. */
export default (_: RouteComponentProps) => {
    const captcha = useCaptcha();
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const auth = useStoreState((state) => state.settings.data!.auth);

    useEffect(() => {
        clearFlashes();
    }, []);

    if (!auth?.registration) return <Redirect to={'/auth/login'} />;

    const hasServices = auth.providers.some((provider) => provider.signup);

    const onSubmit = (values: Values, { setSubmitting }: FormikHelpers<Values>) => {
        clearFlashes();

        captcha
            .run()
            .then((token) => register({ ...values, captcha: token }))
            .then((intended) => {
                // @ts-expect-error this is valid
                window.location = intended || '/';
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
            initialValues={{ username: '', email: '', password: '', passwordConfirmation: '' }}
            validationSchema={object().shape({
                username: string()
                    .required('Choose a username.')
                    .min(3, 'A username needs at least 3 characters.')
                    .matches(
                        USERNAME,
                        'Use letters, numbers, dashes, underscores and periods, starting and ending with a letter or number.'
                    ),
                email: string().email('Enter a valid email address.').required('Enter your email address.'),
                password: string().min(8, 'A password needs at least 8 characters.').required('Choose a password.'),
                passwordConfirmation: string().test('match', 'The passwords are not the same.', function (value) {
                    return value === this.parent.password;
                }),
            })}
        >
            {({ isSubmitting }) => (
                <LoginFormContainer
                    title={'Create an account'}
                    subtitle={'Sign up to get your own servers.'}
                    css={tw`w-full flex`}
                >
                    {auth.passwordRegistration && (
                        <>
                            <Field
                                light
                                type={'text'}
                                label={'Username'}
                                name={'username'}
                                autoComplete={'username'}
                                disabled={isSubmitting}
                            />
                            <div css={tw`mt-6`}>
                                <Field
                                    light
                                    type={'email'}
                                    label={'Email'}
                                    name={'email'}
                                    autoComplete={'email'}
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div css={tw`mt-6`}>
                                <Field
                                    light
                                    type={'password'}
                                    label={'Password'}
                                    name={'password'}
                                    autoComplete={'new-password'}
                                    description={'At least 8 characters.'}
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div css={tw`mt-6`}>
                                <Field
                                    light
                                    type={'password'}
                                    label={'Confirm password'}
                                    name={'passwordConfirmation'}
                                    autoComplete={'new-password'}
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div css={tw`mt-6`}>
                                <Button
                                    type={'submit'}
                                    size={'xlarge'}
                                    isLoading={isSubmitting}
                                    disabled={isSubmitting}
                                >
                                    Create account
                                </Button>
                            </div>
                            <Captcha ref={captcha.ref} />
                        </>
                    )}
                    {hasServices && (
                        <>
                            {auth.passwordRegistration && <OrDivider />}
                            <ProviderButtons signup />
                        </>
                    )}
                    <div css={tw`mt-6 text-center text-sm text-neutral-400`}>
                        Have an account already?&nbsp;
                        <Link
                            to={'/auth/login'}
                            css={tw`text-primary-600 font-medium no-underline hover:text-primary-700`}
                        >
                            Sign in
                        </Link>
                    </div>
                </LoginFormContainer>
            )}
        </Formik>
    );
};
