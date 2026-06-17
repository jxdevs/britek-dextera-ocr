import { IsOptional, IsString, IsUUID } from 'class-validator';

export class DashboardKpisDto {
  @IsOptional()
  @IsString()
  project_name?: string;

  @IsOptional()
  @IsString()
  cost_center?: string;

  @IsOptional()
  @IsUUID()
  worker_id?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
