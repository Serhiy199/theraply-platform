import type { AlertProps } from "@/components/ui/alert";
import { Alert } from "@/components/ui/alert";

type DashboardStatusAlertProps = Omit<AlertProps, "className">;

export function DashboardStatusAlert(props: DashboardStatusAlertProps) {
  return <Alert {...props} />;
}
