#!/bin/bash
echo "=== Find compose file(s) ==="
ls -la /root/*.yml /root/**/docker-compose.yml 2>/dev/null
find / -name 'docker-compose.yml' 2>/dev/null | grep -v '/var/lib/docker' | head -20

echo
echo "=== Compose project + workdir of running auth container ==="
docker inspect xnova-auth --format 'project={{ index .Config.Labels "com.docker.compose.project" }}'
docker inspect xnova-auth --format 'workdir={{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
docker inspect xnova-auth --format 'configfiles={{ index .Config.Labels "com.docker.compose.project.config_files" }}'
docker inspect xnova-auth --format 'image={{ .Config.Image }}'
