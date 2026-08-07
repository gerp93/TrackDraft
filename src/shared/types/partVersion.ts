export interface PartVersion {
  id: string;
  partId: string;
  versionNumber: number;
  lines: string[];
  rhymeScheme: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePartVersionInput {
  partId: string;
  lines?: string[];
  rhymeScheme?: string | null;
}
