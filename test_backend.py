#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
后端服务测试脚本
"""
import sys
import time
import subprocess
import requests

def test_backend():
    print("=" * 80)
    print("后端服务测试")
    print("=" * 80)
    print()

    # 1. 测试配置加载
    print("1. 测试配置加载...")
    try:
        from backend.main import CONFIG
        print("   OK - 配置加载成功")
        print(f"   - Base URL: {CONFIG['baseUrl']}")
        print(f"   - Model: {CONFIG['defaultModel']}")
        print(f"   - Port: {CONFIG['port']}")
        print(f"   - API Key: {'已配置' if CONFIG['apiKey'] else '未配置'}")
    except Exception as e:
        print(f"   ERR - 配置加载失败: {e}")
        return False

    print()

    # 2. 启动后端服务
    print("2. 启动后端服务...")
    try:
        process = subprocess.Popen(
            [sys.executable, "backend/main.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        print(f"   OK - 后端进程已启动 (PID: {process.pid})")
        time.sleep(3)  # 等待服务启动
    except Exception as e:
        print(f"   ERR - 启动失败: {e}")
        return False

    print()

    # 3. 测试健康检查
    print("3. 测试健康检查...")
    try:
        response = requests.get(f"http://127.0.0.1:{CONFIG['port']}/api/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print("   OK - 健康检查通过")
            print(f"   - 配置状态: {'已配置' if data.get('configured') else '未配置'}")
            print(f"   - 上游地址: {data.get('upstream')}")
            print(f"   - 默认模型: {data.get('defaultModel')}")
        else:
            print(f"   ERR - 健康检查失败 (状态码: {response.status_code})")
            process.terminate()
            return False
    except Exception as e:
        print(f"   ERR - 健康检查失败: {e}")
        process.terminate()
        return False

    print()

    # 4. 清理
    print("4. 清理...")
    process.terminate()
    process.wait(timeout=5)
    print("   OK - 后端进程已停止")

    print()
    print("=" * 80)
    print("所有测试通过！后端服务可以正常运行")
    print("=" * 80)
    print()
    print("启动命令：")
    print("   python backend/main.py")
    print()

    return True

if __name__ == "__main__":
    success = test_backend()
    sys.exit(0 if success else 1)
