import { cn } from '~/utils';

type TSubRowProps = {
  children: React.ReactNode;
  classes?: string;
  subclasses?: string;
  onClick?: () => void;
};

export default function SubRow({ children, classes = '', onClick }: TSubRowProps) {
  return (
    <div
      className={cn(
        'mt-2 flex min-h-[31px] items-center justify-start gap-3 empty:hidden lg:flex',
        classes,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
