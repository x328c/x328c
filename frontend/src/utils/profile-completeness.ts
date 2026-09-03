import Taro from '@tarojs/taro';
import { userService } from '@/services/users';
import { useUserStore } from '@/stores/user-store';
import { openLogin } from './login-return';

export async function ensureProfileComplete(returnUrl?: string): Promise<boolean> {
  const session = useUserStore.getState();
  session.hydrate();
  if (!session.isLoggedIn) {
    await openLogin(returnUrl);
    return false;
  }
  const profile = await userService.profile();
  if (session.accessToken && session.refreshToken) {
    session.setSession(session.accessToken, session.refreshToken, profile);
  }
  if (profile.profile_complete) return true;
  await Taro.showModal({
    title: '请先完善个人资料',
    content: `还需填写：${profile.missing_profile_fields?.join('、') || '用户名称、头像、联系方式、车型'}`,
    showCancel: false,
    confirmText: '去完善',
  });
  await Taro.navigateTo({ url: '/pages/profile/edit/index?required=1' });
  return false;
}

