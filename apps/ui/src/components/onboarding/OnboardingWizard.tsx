import { useState } from 'react';
import Step1Form from './Step1Form';
import Step2Upload from './Step2Upload';
import Step3Success from './Step3Success';
import { getErrorMessage } from '../../lib/error-messages';

type Step = 1 | 2 | 3;

interface Step1Data {
  email: string;
  restaurantName: string;
}

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';

function StepIndicator({ current }: { current: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: 'Información' },
    { n: 2, label: 'Menú' },
    { n: 3, label: 'Confirmación' },
  ];

  return (
    <div className="flex items-center justify-center mb-10 gap-2">
      {steps.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                data-testid={`step-${s.n}`}
                data-active={String(active)}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-base transition-all duration-300 ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? '✓' : s.n}
              </div>
              <span
                className={`text-xs font-semibold ${
                  active ? 'text-indigo-500' : 'text-slate-500'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-[3px] w-[60px] mb-6 transition-colors duration-300 rounded-full ${
                  done ? 'bg-indigo-500' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingWizard() {
  const [step, setStep] = useState<Step>(1);
  const [formData, setFormData] = useState<Step1Data | null>(null);
  const [productsCreated, setProductsCreated] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleStep1Submit(data: Step1Data) {
    setFormData(data);
    setError(null);
    setStep(2);
  }

  async function handleStep2Submit(photo: File | null, useDemo: boolean) {
    if (!formData) return;

    setIsLoading(true);
    setError(null);

    const body = new globalThis.FormData();
    body.append('email', formData.email);
    body.append('restaurantName', formData.restaurantName);
    if (useDemo) {
      body.append('createDemoData', 'true');
    } else if (photo) {
      body.append('photos', photo);
    }

    try {
      const response = await fetch(`${API_URL}/v1/onboarding/register`, {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const msg = errorData?.code
          ? getErrorMessage(errorData.code)
          : 'Hubo un error al procesar tu solicitud.';
        setError(msg);
        return;
      }

      const result = await response.json();
      setProductsCreated(result.productsCreated ?? 0);
      setStep(3);
    } catch {
      setError('Hubo un error al procesar tu solicitud. Intenta nuevamente.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="bg-white/95 rounded-3xl shadow-2xl w-full max-w-[520px] p-10 relative overflow-hidden">
      <StepIndicator current={step} />

      {step === 1 && <Step1Form onSubmit={handleStep1Submit} />}
      {step === 2 && (
        <Step2Upload
          onSubmit={handleStep2Submit}
          onBack={() => setStep(1)}
          isLoading={isLoading}
          error={error}
        />
      )}
      {step === 3 && formData && (
        <Step3Success
          email={formData.email}
          restaurantName={formData.restaurantName}
          productsCreated={productsCreated}
        />
      )}
    </div>
  );
}
