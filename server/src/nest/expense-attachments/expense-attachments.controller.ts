import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '../../types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { TripAccess } from '../database/database.service';
import { ExpenseAttachmentsService } from './expense-attachments.service';
import { TripAccessGuard } from '../permissions/trip-access.guard';
import { Trip } from '../permissions/trip.decorator';

/** Typed Expense/File operations under the existing trip budget namespace. */
@Controller('api/trips/:tripId/budget')
@UseGuards(JwtAuthGuard, TripAccessGuard)
export class ExpenseAttachmentsController {
  constructor(private readonly attachments: ExpenseAttachmentsService) {}

  @Get(':expenseId/files')
  list(@Param('tripId') tripId: string, @Param('expenseId') expenseId: string) {
    const files = this.attachments.list(tripId, expenseId);
    if (!files) throw this.notFound();
    return { files };
  }

  @Post(':expenseId/files/:fileId')
  @HttpCode(200)
  attach(
    @CurrentUser() user: User,
    @Trip() trip: TripAccess,
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @Param('fileId') fileId: string,
    @Headers('x-socket-id') socketId?: string,
  ) {
    this.assertMutation(trip, user);
    const file = this.attachments.attach(tripId, expenseId, fileId, socketId);
    if (!file) throw this.notFound();
    return { file };
  }

  @Delete(':expenseId/files/:fileId')
  detach(
    @CurrentUser() user: User,
    @Trip() trip: TripAccess,
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @Param('fileId') fileId: string,
    @Headers('x-socket-id') socketId?: string,
  ) {
    this.assertMutation(trip, user);
    const file = this.attachments.detach(tripId, expenseId, fileId, socketId);
    if (!file) throw this.notFound();
    return { success: true, file };
  }

  private assertMutation(trip: TripAccess, user: User): void {
    if (!this.attachments.canMutate(trip, user) && !this.attachments.canEditFiles(trip, user)) {
      throw new HttpException({ error: 'No permission' }, 403);
    }
  }

  private notFound(): HttpException {
    return new HttpException({ error: 'Expense or file not found' }, 404);
  }
}
