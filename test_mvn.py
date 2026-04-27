import urllib.request
url = 'https://search.maven.org/solrsearch/select?q=g:com.alibaba+AND+a:dashscope-sdk-java&rows=1&wt=json'
req = urllib.request.Request(url)
try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode())
except Exception as e:
    print('Error:', e)
