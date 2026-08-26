import { Injectable, NestInterceptor, ExecutionContext, CallHandler, StreamableFile } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // Binary responses must NOT be wrapped. A StreamableFile serialised
        // into the JSON envelope becomes a dump of the stream's internals and
        // the file never reaches the client — verified against the download
        // endpoint before this guard was added.
        if (data instanceof StreamableFile) {
          return data as unknown as ApiResponse<T>;
        }

        // If the controller already returned a formatted response, pass it through
        if (data && typeof data === 'object' && 'success' in data && 'message' in data) {
          return data;
        }
        return {
          success: true,
          message: 'Request successful',
          data,
        };
      }),
    );
  }
}
