import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={`mb-6 ${className}`}
    >
      <ol className="flex items-center flex-wrap gap-1 text-sm text-slate-500">
        <li>
          <Link
            to="/"
            className="hover:text-cyan-400 transition-colors flex items-center gap-1"
          >
            <Home className="w-4 h-4" />
            <span>Inicio</span>
          </Link>
        </li>
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-1">
            <ChevronRight className="w-4 h-4 text-slate-600" />
            {item.href ? (
              <Link
                to={item.href}
                className="hover:text-cyan-400 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-slate-300 font-medium" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
