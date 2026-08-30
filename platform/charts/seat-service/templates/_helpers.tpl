{{- define "seat-service.name" -}}
{{ .Values.nameOverride | default .Release.Name }}
{{- end -}}

{{- define "seat-service.labels" -}}
app: {{ include "seat-service.name" . }}
{{- end -}}
