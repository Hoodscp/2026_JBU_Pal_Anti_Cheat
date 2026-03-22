# Palworld REST API Dashboard 🌟

팰월드(Palworld) 전용 서버(Dedicated Server)를 위한 **웹 기반 관리 대시보드**입니다. 
게임 내 인게임 콘솔이나 RCON 없이도, 직관적인 UI를 통해 원격으로 직접 서버 상태를 모니터링하고 각종 관리 기능을 손쉽게 사용할 수 있습니다.

![Dashboard Preview](https://storage.googleapis.com/palworld-dashboard/preview-placeholder) <!-- 스크린샷 캡처본을 여기에 추가하시면 좋습니다 -->

## 🚀 주요 기능

- **📊 서버 모니터링**
  - 실시간 접속 플레이어 목록 및 접속자 수 확인
  - 서버 FPS, 업타임, 프레임타임, 남은 건물 수 등 메트릭 정보 추적
  - 현재 적용된 서버 설정 (난이도, 경험치 배율, 팰 포획 확률/스폰 배율 등) 한눈에 보기
- **👥 플레이어 관리**
  - 쾌적한 인게임 관리를 위한 플레이어 **추방 (Kick)** 지원
  - 악용 유저의 **영구 차단 (Ban)** 기능
  - 차단된 플레이어 목록(블랙리스트) 로컬 저장 및 관리, **차단 해제 (Unban)** 지원
- **🛠️ 서버 제어**
  - 전체 플레이어 대상 **글로벌 공지 전송 (Announce)**
  - 월드 진행 상황 **수동 저장 (Save)**
  - **정상 종료 (Shutdown)** (남은 시간 카운트다운 타이머 및 종료 전 사전 메시지 지원)
  - **즉시 강제 종료 (Force Shutdown)** (서버 응답 불가 시 비상용)

## 🛠 기술 스택

- **Frontend Framework:** React 18 + Vite (TypeScript)
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui & Radix UI
- **Icons:** Lucide React

## ⚙️ 시작 및 설정 가이드

### 1. 팰월드 서버 REST API 활성화
대시보드를 연동하기 전, 사용하시는 팰월드 데디케이티드 서버의 `PalWorldSettings.ini` 등 구동 설정 파일에서 REST API를 반드시 활성화해야 합니다.
```ini
RESTAPIEnabled=True
RESTAPIPort=8212
AdminPassword="your-admin-password"
```

### 2. 패키지 설치
본 저장소(Repository)를 클론(Clone)하거나 폴더를 다운로드 받은 뒤, 디렉토리에서 의존성 패키지를 설치합니다.
```bash
npm install
```

### 3. 개발 서버 실행
```bash
npm run dev
```
명령어를 입력하면 `http://localhost:5173/`으로 로컬 호스트 주소가 열리게 되며, 해당 주소에 접속하여 서버 URL 정보(`http://[서버IP]:8212/v1/api`)와 어드민 계정(기본값 `admin`), 비밀번호(`AdminPassword`)를 입력하고 "새로고침"을 누르면 즉시 동기화가 시작됩니다.

## ⚠️ CORS 문제 및 해결
팰월드 공식 REST API는 기본적으로 브라우저 직접 접근 시 발생하는 **CORS 에러**를 서버(백엔드 로직 측)에서 제어할 수 없는 제약이 있습니다. 
이러한 문제를 해결하기 위해 이 프로젝트는 **Vite 로컬 프록시(Proxy)** 설정을 활용하여, 별도의 미들웨어나 플러그인 설치 없이도 개발 스크립트(`npm run dev`) 하나만으로 CORS를 우회할 수 있도록 구성되어 있습니다!

## 📝 라이선스
This project is licensed under the MIT License.
