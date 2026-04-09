import { useEffect, useRef } from 'react';

interface TurnstileProps {
  sitekey: string;
  onVerify: (token: string) => void;
  onError?: (error: any) => void;
}

declare global {
  interface Window {
    turnstile: {
      render: (container: string | HTMLElement, options: any) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export const Turnstile = ({ sitekey, onVerify, onError }: TurnstileProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onVerify, onError });

  // Keep callbacks up to date without triggering effects
  useEffect(() => {
    callbacksRef.current = { onVerify, onError };
  }, [onVerify, onError]);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderWidget = () => {
      try {
        if (window.turnstile && typeof window.turnstile.render === 'function' && containerRef.current) {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey,
            callback: (token: string) => {
              callbacksRef.current.onVerify(token);
            },
            'error-callback': (error: any) => {
              if (callbacksRef.current.onError) callbacksRef.current.onError(error);
            },
            theme: 'light',
          });
        }
      } catch (err) {
        console.error('Turnstile render error:', err);
        if (callbacksRef.current.onError) callbacksRef.current.onError(err);
      }
    };

    // If script is already loaded, render immediately
    if (window.turnstile) {
      renderWidget();
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) {
          renderWidget();
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [sitekey]); // Only re-render if sitekey changes

  return <div ref={containerRef} className="flex justify-center min-h-[65px]" />;
};
