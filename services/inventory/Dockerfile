FROM python:3.12-slim AS build
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/deps -r requirements.txt

FROM python:3.12-slim
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
RUN useradd -u 10001 -m appuser
WORKDIR /app
COPY --from=build /deps /usr/local
COPY app/ ./app/
USER 10001
EXPOSE 8080
CMD ["gunicorn", "-b", "0.0.0.0:8080", "-w", "4", "-k", "gthread", "--threads", "8", "app:create_app()"]
