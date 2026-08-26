import { Module } from '@nestjs/common';

// ── Feature modules ────────────────────────────────────────────────────────
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { MilestonesModule } from './modules/milestones/milestones.module';
import { ProposalsModule } from './modules/proposals/proposals.module';
import { AuditRequestsModule } from './modules/audit-requests/audit-requests.module';
import { AuditReportsModule } from './modules/audit-reports/audit-reports.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ExpertApplicationsModule } from './modules/expert-applications/expert-applications.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MessagesModule } from './modules/messages/messages.module';
import { SeedModule } from './modules/seed/seed.module';

// ── Middleware layer modules — one per branch ──────────────────────────────
import { LoggingModule } from './common/logging/logging.module'; //        V1
import { ErrorHandlingModule } from './common/errors/error-handling.module'; // V2
import { UploadsModule } from './modules/uploads/uploads.module'; //       V3
import { SecurityModule } from './common/security/security.module'; //     V4
import { RoutingModule } from './common/routing/routing.module'; //        V5


/**
 * ⚠️  FROZEN FILE — do not edit on a layer branch.
 *
 * All five layer modules are already imported below. Fill in YOUR module, not
 * this file. Register filters, guards and interceptors inside your own module
 * using APP_FILTER / APP_GUARD / APP_INTERCEPTOR providers.
 *
 * ALL middleware registration lives in layer modules, none in this file:
 *   - APPLICATION-level (forRoutes('*'))  -> LoggingModule.configure()   (V1)
 *   - ROUTER-level (scoped forRoutes)     -> RoutingModule.configure()   (V5)
 * That is why this file has no configure() of its own.
 *
 * See Team-Branch-Split-Plan.md section 6.
 */
@Module({
  imports: [
    // Middleware layers
    LoggingModule,
    ErrorHandlingModule,
    UploadsModule,
    SecurityModule,
    RoutingModule,

    // Features
    UsersModule,
    TasksModule,
    MilestonesModule,
    ProposalsModule,
    AuditRequestsModule,
    AuditReportsModule,
    DisputesModule,
    TransactionsModule,
    ExpertApplicationsModule,
    NotificationsModule,
    MessagesModule,
    SeedModule,
  ],
})
export class AppModule {}
