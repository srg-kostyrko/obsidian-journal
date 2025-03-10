export interface PluginNotification {
  id: string;
  icon: string;
  message: string;
}

export const currentNotifications: PluginNotification[] = [
  {
    id: "v2-commands-change",
    icon: "lucide-alert-triangle",
    message: `Commands were considerably changed in v2 resulting in them having different ids compared to v1. 
        So if you have used command ids in other plugins, you may need to adjust them.`,
  },
];
