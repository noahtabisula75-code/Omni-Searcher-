import { useEffect, useRef } from 'react';

interface TurnstileProps {
  sitekey: string;
  onVerify: (token: string) => void;
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

export const Turnstile = ({ sitekey, onVerify }: TurnstileProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderWidget = () => {
      try {
        if (window.turnstile && typeof window.turnstile.render === 'function' && containerRef.current) {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey,
            callback: (token: string) => {
              onVerify(token);
            },
            theme: 'light',
          });
        }
      } catch (err) {
        console.error('Turnstile render error:', err);
      }
    };

    // If script is already loaded, render immediately
    if (window.turnstile) {
      renderWidget();
    } else {
      // Otherwise wait for it (though async/defer usually handles this)
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
      }
    };
  }, [sitekey, onVerify]);

  return <div ref={containerRef} className="flex justify-center" />;
};
