function Read-BridgeHealth {
    $response=$null; $reader=$null
    try {
        $request=[System.Net.WebRequest]::Create('http://127.0.0.1:20129/__codex_grok_bridge_health')
        $request.Proxy=$null; $request.Timeout=2000
        $response=$request.GetResponse()
        $reader=New-Object System.IO.StreamReader($response.GetResponseStream())
        return ($reader.ReadToEnd() | ConvertFrom-Json)
    } catch {return $null}
    finally {if($reader){$reader.Dispose()};if($response){$response.Dispose()}}
}
function Invoke-LocalJson([string]$Url,[hashtable]$Headers,[string]$JsonBody='') {
    $response=$null;$reader=$null
    try {
        $request=[System.Net.WebRequest]::Create($Url)
        $request.Proxy=$null;$request.Timeout=90000
        foreach($name in $Headers.Keys){$request.Headers[$name]=$Headers[$name]}
        if($JsonBody){
            $request.Method='POST';$request.ContentType='application/json'
            $bytes=[System.Text.Encoding]::UTF8.GetBytes($JsonBody)
            $request.ContentLength=$bytes.Length
            $stream=$request.GetRequestStream()
            try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
        }
        $response=$request.GetResponse()
        $reader=New-Object System.IO.StreamReader($response.GetResponseStream())
        return ($reader.ReadToEnd()|ConvertFrom-Json)
    } finally {if($reader){$reader.Dispose()};if($response){$response.Dispose()}}
}
