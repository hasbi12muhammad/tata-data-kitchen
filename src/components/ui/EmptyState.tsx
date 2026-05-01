import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="p-4 rounded-full bg-[#EDE4CF] mb-4">
        <Icon className="w-8 h-8 text-[#B88D6A]" />
      </div>
      <h3 className="text-base font-semibold text-[#4A3728] mb-1">{title}</h3>
      <p className="text-sm text-[#7C6352] max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
