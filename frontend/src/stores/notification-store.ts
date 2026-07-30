import { create } from "zustand";
interface NotificationState { unreadCount:number; setUnreadCount:(count:number)=>void; }
export const useNotificationStore=create<NotificationState>((set)=>({unreadCount:0,setUnreadCount:(unreadCount)=>set({unreadCount})}));
