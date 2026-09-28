import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// Modules
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { DetectionsModule } from './detections/detections.module';
import { SettingsModule } from './settings/settings.module';
import { CamerasModule } from './cameras/cameras.module';
import { UnitsModule } from './units/units.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { IncidentsModule } from './incidents/incidents.module';
import { AlertsModule } from './alerts/alerts.module';
import { FacesModule } from './faces/faces.module';
import { SeedModule } from './seed/seed.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AiGatewayModule } from './ai-gateway/ai-gateway.module';
import { AuthGuard } from './auth/auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { SecurityModule } from './security/security.module';
import { RealtimeModule } from './realtime/realtime.module';


// Switched to PostgreSQL
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'stmc',
      autoLoadEntities: true,
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
    }),
    UsersModule,
    FacesModule,
    AlertsModule,
    IncidentsModule,
    EnrollmentsModule,
    UnitsModule,
    CamerasModule,
    SettingsModule,
    DetectionsModule,
    ReportsModule,
    SeedModule,
    DashboardModule,
    AiGatewayModule,
    SecurityModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AuthGuard }, { provide: APP_GUARD, useClass: RolesGuard }],
})
export class AppModule {}
