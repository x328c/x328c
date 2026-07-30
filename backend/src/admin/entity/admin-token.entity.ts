export interface AdminJwtPayload {
  sub: string;
  role: number;
  type: 'admin';
}
