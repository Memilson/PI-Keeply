package com.example.backupagent.diff;

import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import com.example.backupagent.backup.Backup.BackupPlan;
import com.example.backupagent.backup.Backup.ManifestFile;
import com.example.backupagent.backup.Backup.ManifestRecord;
import com.example.backupagent.scan.Scanner.FileMetadata;
import com.example.backupagent.scan.Scanner.ScanResult;

/**
 * Agrega tipos relacionados ao cálculo de diffs entre scans e manifests.
 */
public final class DiffModule {

    private DiffModule() {}

    /** Tipo de backup suportado no fluxo atual. */
    public enum BackupType {
        FULL,
        INCREMENTAL
    }

    /** Determina se um backup será FULL ou INCREMENTAL e calcula o plano delta. */
    public static final class DiffPlanner {

        public BackupPlan plan(ScanResult scanResult, ManifestRecord latestManifest) {
            Objects.requireNonNull(scanResult, "scanResult");
            BackupPlan.Builder builder = BackupPlan.builder()
                    .root(scanResult.root());

            if (latestManifest == null) {
                builder.type(BackupType.FULL)
                        .files(scanResult.files());
                return builder.build();
            }

            Map<String, ManifestFile> previous = mapByPath(latestManifest.files());
            List<FileMetadata> delta = new ArrayList<>();
            for (FileMetadata metadata : scanResult.files()) {
                String normPath = normalize(metadata.relativePath());
                ManifestFile prev = previous.get(normPath);
                
                if (prev == null || changed(prev, metadata)) {
                    delta.add(metadata);
                }
            }
            
            builder.type(BackupType.INCREMENTAL)
                    .files(delta)
                    .parentManifest(latestManifest)
                    .backupId(UUID.randomUUID());
            return builder.build();
        }

        private Map<String, ManifestFile> mapByPath(List<ManifestFile> files) {
            Map<String, ManifestFile> map = new HashMap<>();
            for (ManifestFile file : files) {
                map.put(normalize(file.path()), file);
            }
            return map;
        }

        private boolean changed(ManifestFile previous, FileMetadata current) {
            if (previous.size() != current.size()) {
                return true;
            }
            
            // Compara timestamps truncando para milissegundos (evita falsos positivos por precisão de nanossegundos)
            Instant prevTime = previous.modifiedAt().truncatedTo(ChronoUnit.MILLIS);
            Instant currTime = current.modifiedAt().truncatedTo(ChronoUnit.MILLIS);
            if (!prevTime.equals(currTime)) {
                return true;
            }
            
            String prevHash = previous.hash().orElse(null);
            String currHash = current.hash().orElse(null);
            if (prevHash != null && currHash != null) {
                return !prevHash.equals(currHash);
            }
            return false;
        }

        private String normalize(Path path) {
            return normalize(path.toString());
        }

        private String normalize(String path) {
            return path.replace('\\', '/');
        }
    }
}
