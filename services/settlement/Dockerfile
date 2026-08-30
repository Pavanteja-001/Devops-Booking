FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /src
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN adduser -D -u 10001 appuser
COPY --from=build /src/target/settlement-1.0.0.jar /app/app.jar
USER 10001
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+UseContainerSupport", "-jar", "/app/app.jar"]
