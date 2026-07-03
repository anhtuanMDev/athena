import MuiCard from "@mui/material/Card";
import MuiCardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

export function Card({ children, className = "", ...props }: { children?: ReactNode; className?: string; [key: string]: unknown }) {
  return <MuiCard className={className} {...props}>{children}</MuiCard>;
}

export function CardHeader({ children, className = "", ...props }: { children?: ReactNode; className?: string; [key: string]: unknown }) {
  return (
    <div className={className} {...props} style={{ padding: "16px 24px 0", ...(props.style as object) }}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = "", ...props }: { children?: ReactNode; className?: string; [key: string]: unknown }) {
  return (
    <Typography variant="subtitle1" className={className} sx={{ fontWeight: 600 }} {...props}>
      {children}
    </Typography>
  );
}

export function CardDescription({ children, className = "", ...props }: { children?: ReactNode; className?: string; [key: string]: unknown }) {
  return (
    <Typography variant="body2" color="text.secondary" className={className} {...props}>
      {children}
    </Typography>
  );
}

export function CardContent({ children, className = "", ...props }: { children?: ReactNode; className?: string; [key: string]: unknown }) {
  return <MuiCardContent className={className} {...props}>{children}</MuiCardContent>;
}
