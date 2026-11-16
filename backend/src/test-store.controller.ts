import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Public } from './common/decorators';

@Controller()
export class TestStoreController {
  @Public()
  @Get('test-store')
  serveTestStore(@Res() res: Response): void {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    const htmlPath = join(process.cwd(), 'test-checkout.html');
    const htmlContent = readFileSync(htmlPath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(htmlContent);
  }
}

