import * as React from 'react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import requestPasswordResetEmail from '@/api/auth/requestPasswordResetEmail';
import { httpErrorToHuman } from '@/api/http';
import LoginFormContainer from '@/components/auth/LoginFormContainer';
import Field from '@/components/elements/Field';
import { Formik, FormikHelpers } from 'formik';
import { object, string } from 'yup';
import tw from 'twin.macro';
import Button from '@/components/elements/Button';
import Captcha, { useCaptcha } from '@/components/auth/Captcha';
import useFlash from '@/plugins/useFlash';

interface Values {
    email: string;
}

export default () => {
    const captcha = useCaptcha();

    const { clearFlashes, addFlash } = useFlash();

    useEffect(() => {
        clearFlashes();
    }, []);

    const handleSubmission = ({ email }: Values, { setSubmitting, resetForm }: FormikHelpers<Values>) => {
        clearFlashes();

        captcha
            .run()
            .then((token) => requestPasswordResetEmail(email, token))
            .then((response) => {
                resetForm();
                addFlash({ type: 'success', title: 'Success', message: response });
            })
            .catch((error) => {
                console.error(error);
                addFlash({ type: 'error', title: 'Error', message: httpErrorToHuman(error) });
            })
            .then(() => {
                captcha.reset();
                setSubmitting(false);
            });
    };

    return (
        <Formik
            onSubmit={handleSubmission}
            initialValues={{ email: '' }}
            validationSchema={object().shape({
                email: string()
                    .email('A valid email address must be provided to continue.')
                    .required('A valid email address must be provided to continue.'),
            })}
        >
            {({ isSubmitting }) => (
                <LoginFormContainer
                    title={'Forgot your password?'}
                    subtitle={"Enter your email and we'll send you a link to reset it."}
                    css={tw`w-full flex`}
                >
                    <Field
                        light
                        label={'Email'}
                        description={
                            'Enter your account email address to receive instructions on resetting your password.'
                        }
                        name={'email'}
                        type={'email'}
                    />
                    <div css={tw`mt-6`}>
                        <Button type={'submit'} size={'xlarge'} disabled={isSubmitting} isLoading={isSubmitting}>
                            Send Email
                        </Button>
                    </div>
                    <Captcha ref={captcha.ref} />
                    <div css={tw`mt-6 text-center`}>
                        <Link
                            to={'/auth/login'}
                            css={tw`text-sm text-primary-600 font-medium no-underline hover:text-primary-700`}
                        >
                            Return to Login
                        </Link>
                    </div>
                </LoginFormContainer>
            )}
        </Formik>
    );
};
