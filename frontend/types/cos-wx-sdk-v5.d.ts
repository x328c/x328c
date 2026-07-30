declare module "cos-wx-sdk-v5" {
  export default class COS {
    constructor(options: {
      getAuthorization: (
        options: unknown,
        callback: (authorization: Record<string, unknown>) => void,
      ) => void;
    });
    uploadFile(
      options: Record<string, unknown>,
      callback: (error: unknown, data: Record<string, unknown>) => void,
    ): void;
  }
}
