import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router";
import { animate } from "animejs";

export function PanelTransition({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    // Smooth panel transition using animejs
    animate(containerRef.current, {
      opacity: [0, 1],
      translateY: [15, 0],
      duration: 500,
      easing: "easeOutExpo",
    });
  }, [location.pathname]); // Re-trigger on path change

  return (
    <div ref={containerRef} className={className} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}
