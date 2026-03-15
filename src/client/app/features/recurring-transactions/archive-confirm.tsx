import type { RecurringTransaction } from "./use-recurring-transactions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ArchiveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurringTransaction: RecurringTransaction | null;
  onConfirm: () => void;
  isPending: boolean;
}

export function ArchiveConfirmDialog({
  open,
  onOpenChange,
  recurringTransaction,
  onConfirm,
  isPending,
}: ArchiveConfirmDialogProps) {
  if (!recurringTransaction) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Archive &ldquo;{recurringTransaction.name}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This recurring transaction will be removed from the active list and
            will no longer count toward your recurring totals.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? "Archiving..." : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
