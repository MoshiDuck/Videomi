// INFO : app/components/ui/Tooltip.tsx
// Composant tooltip réutilisable
import React, { useState, useRef, useEffect } from 'react';
import { darkTheme } from '~/utils/ui/theme';

interface TooltipProps {
    content: string;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
    delay?: number;
}

export function Tooltip({ content, children, position = 'top', delay = 300 }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    let timeoutId: NodeJS.Timeout | null = null;

    const showTooltip = () => {
        timeoutId = setTimeout(() => {
            setIsVisible(true);
            updateTooltipPosition();
        }, delay);
    };

    const hideTooltip = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        setIsVisible(false);
    };

    const updateTooltipPosition = () => {
        if (!triggerRef.current || !tooltipRef.current) return;

        const triggerRect = triggerRef.current.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();

        let top = 0;
        let left = 0;

        switch (position) {
            case 'top':
                top = triggerRect.top - tooltipRect.height - 8;
                left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
                break;
            case 'bottom':
                top = triggerRect.bottom + 8;
                left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
                break;
            case 'left':
                top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
                left = triggerRect.left - tooltipRect.width - 8;
                break;
            case 'right':
                top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
                left = triggerRect.right + 8;
                break;
        }

        // Ajuster si le tooltip sort de l'écran
        const padding = 8;
        if (left < padding) left = padding;
        if (left + tooltipRect.width > window.innerWidth - padding) {
            left = window.innerWidth - tooltipRect.width - padding;
        }
        if (top < padding) top = padding;
        if (top + tooltipRect.height > window.innerHeight - padding) {
            top = window.innerHeight - tooltipRect.height - padding;
        }

        setTooltipStyle({
            position: 'fixed',
            top: `${top}px`,
            left: `${left}px`,
            zIndex: 10000
        });
    };

    useEffect(() => {
        if (isVisible) {
            updateTooltipPosition();
            window.addEventListener('scroll', updateTooltipPosition);
            window.addEventListener('resize', updateTooltipPosition);
        }

        return () => {
            window.removeEventListener('scroll', updateTooltipPosition);
            window.removeEventListener('resize', updateTooltipPosition);
        };
    }, [isVisible]);

    return (
        <>
            <div
                ref={triggerRef}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                onFocus={showTooltip}
                onBlur={hideTooltip}
                style={{ display: 'inline-block' }}
            >
                {children}
            </div>
            {isVisible && (
                <div
                    ref={tooltipRef}
                    style={{
                        ...tooltipStyle,
                        backgroundColor: darkTheme.background.tertiary,
                        color: darkTheme.text.primary,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        lineHeight: '1.4',
                        maxWidth: '250px',
                        boxShadow: darkTheme.shadow.medium,
                        border: `1px solid ${darkTheme.background.tertiary}`,
                        pointerEvents: 'none',
                        opacity: isVisible ? 1 : 0,
                        transition: 'opacity 0.2s'
                    }}
                >
                    {content}
                    <div
                        style={{
                            position: 'absolute',
                            width: 0,
                            height: 0,
                            ...(position === 'top' && {
                                top: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                borderLeft: '6px solid transparent',
                                borderRight: '6px solid transparent',
                                borderTop: `6px solid ${darkTheme.background.tertiary}`
                            }),
                            ...(position === 'bottom' && {
                                bottom: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                borderLeft: '6px solid transparent',
                                borderRight: '6px solid transparent',
                                borderBottom: `6px solid ${darkTheme.background.tertiary}`
                            }),
                            ...(position === 'left' && {
                                left: '100%',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                borderTop: '6px solid transparent',
                                borderBottom: '6px solid transparent',
                                borderLeft: `6px solid ${darkTheme.background.tertiary}`
                            }),
                            ...(position === 'right' && {
                                right: '100%',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                borderTop: '6px solid transparent',
                                borderBottom: '6px solid transparent',
                                borderRight: `6px solid ${darkTheme.background.tertiary}`
                            })
                        }}
                    />
                </div>
            )}
        </>
    );
}
