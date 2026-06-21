import 'express';

declare global {
  namespace Express {
     namespace Multer {
      interface File {
        bucket: string;
        key: string;
        location: string;
        etag: string;
      }
    }

    interface Request {
      rawBody?: Buffer;
    }

    
  }
}