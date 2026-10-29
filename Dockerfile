FROM gradle:jdk21 AS build
WORKDIR /src
COPY build.gradle settings.gradle ./
COPY src src
RUN --mount=type=cache,target=/home/gradle/.gradle gradle bootJar --no-daemon -q

FROM eclipse-temurin:21-jre-alpine
COPY --from=build /src/build/libs/quack.jar /app.jar
# ponytail: 256MB heap is plenty for one user; raise -Xmx if it ever OOMs
ENV JAVA_TOOL_OPTIONS="-Xmx256m -XX:+UseSerialGC"
ENTRYPOINT ["java", "-jar", "/app.jar"]
