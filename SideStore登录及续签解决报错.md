# SideStore 登录及续签解决报错

本文整理两个操作：修复 SideStore 登录时的 503 报错，以及通过 Surge 本地回环连接进行续签。

## 一、解决 SideStore 登录 503 报错

1. 打开 **SideStore → Settings → User Customizations → Anisette Client Configuration**。
2. 将 **Client Info** 替换为下面这一整行，然后点击 **Save Overrides**：

```text
<Mac15,7> <Mac OS X;27.0;26A5378j> <com.apple.AuthKit/1 (com.apple.akd/1.0)>
```

3. 打开 **Settings → User Customizations → Reset adi.pb**。
4. 点击 **Reset & Sign Out**。如果出现 **Keep Headers** 选项，务必保持勾选，避免刚才设置的 Client Info 被清除。
5. 在 iOS 应用切换器中完全关闭 SideStore，再重新打开。
6. 重新登录 Apple ID，输入验证码后等待结果，不要连续点击。

## 二、通过 Surge 本地回环进行续签

打开 **SideStore → Settings → Connection Config**，按以下方式设置：

- **Use Local VPN：关闭**
- **Device IP：填写 `10.7.0.1`**
- **RemotePair Port：填写 `49152`**
- **Reachable：应显示 `Yes`**

确认后点击右上角 **Confirm** 保存。

然后：

1. 开启 Surge，确保本地回环配置已启用并正常工作。
2. 打开 SideStore → **My Apps**。
3. 点击 **Refresh All**，或对需要续签的应用执行刷新。

## 注意事项

- 上述 `10.7.0.1` 和 `49152` 是截图中显示的连接参数；如果你的 Surge 实际配置不同，应填写与实际配置匹配的地址和端口。
- **Reachable** 应显示 **Yes**。如果显示 N/A 或连接失败，说明 SideStore 尚未成功连通设备端点，不能仅凭开启 Surge 就认为连接已经建立。
- 登录 503 与续签连接失败是两个不同环节：先处理登录信息及 adi.pb，再检查本地回环连接。
