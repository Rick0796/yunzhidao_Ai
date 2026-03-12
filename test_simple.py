"""
简单的后端测试脚本
"""
import sys
import os

# 切换到项目根目录
os.chdir(os.path.dirname(os.path.abspath(__file__)))

print("=" * 60)
print("测试后端配置和启动")
print("=" * 60)
print()

# 测试1: 导入模块
print("[1/3] 测试导入后端模块...")
try:
    from backend.main import CONFIG, app
    print("  OK - 模块导入成功")
except Exception as e:
    print(f"  FAIL - 导入失败: {e}")
    sys.exit(1)

print()

# 测试2: 检查配置
print("[2/3] 检查配置...")
print(f"  Base URL: {CONFIG['baseUrl']}")
print(f"  Model: {CONFIG['defaultModel']}")
print(f"  Port: {CONFIG['port']}")
print(f"  API Key: {'已配置' if CONFIG['apiKey'] and CONFIG['apiKey'] != 'sk-替换成你的密钥' else '未配置'}")

if not CONFIG['apiKey'] or CONFIG['apiKey'] == 'sk-替换成你的密钥':
    print()
    print("  WARNING - API Key 未配置或使用示例密钥")
    print("  请在 backend/config.local.json 或 server/config.local.json 中配置真实的 API Key")

print()

# 测试3: 测试 FastAPI 应用
print("[3/3] 测试 FastAPI 应用...")
try:
    from fastapi.testclient import TestClient
    client = TestClient(app)
    response = client.get("/api/health")

    if response.status_code == 200:
        data = response.json()
        print("  OK - 健康检查通过")
        print(f"  配置状态: {data.get('configured')}")
        print(f"  上游地址: {data.get('upstream')}")
    else:
        print(f"  FAIL - 健康检查失败 (状态码: {response.status_code})")
        sys.exit(1)
except ImportError:
    print("  SKIP - 未安装 TestClient，跳过应用测试")
    print("  可以运行: pip install httpx")
except Exception as e:
    print(f"  FAIL - 应用测试失败: {e}")
    sys.exit(1)

print()
print("=" * 60)
print("所有测试通过！")
print("=" * 60)
print()
print("启动命令:")
print("  python backend/main.py")
print()
