export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  googleSub: string | null;
};

export type SessionData = {
  id: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  userId: string;
};

export type AppEnv = {
  Variables: {
    requestId: string;
    user: SessionUser;
    session: SessionData;
    workspaceId: string;
  };
};
