# Stage 1: Build the application using Maven
FROM maven:3.9.6-eclipse-temurin-21-alpine AS builder
WORKDIR /app

# Copy the pom.xml and download dependencies (caches them so subsequent builds are faster)
COPY pom.xml .
RUN mvn dependency:go-offline

# Copy the source code and compile the .jar file
COPY src ./src
RUN mvn clean package -DskipTests

# Stage 2: Create the lightweight runtime image
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Expose the standard Spring Boot port
EXPOSE 8080

# Copy the built .jar file from the 'builder' stage into this final image
COPY --from=builder /app/target/*.jar app.jar

# Command to run the application
ENTRYPOINT ["java", "-jar", "app.jar"]