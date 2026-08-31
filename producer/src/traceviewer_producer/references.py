import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from .models import Reference


ARXIV_PATTERN = re.compile(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})(?:v\d+)?")


def is_arxiv_url(url: str) -> bool:
    return ARXIV_PATTERN.search(url) is not None


def fetch_arxiv_reference(url: str) -> Reference:
    match = ARXIV_PATTERN.search(url)
    if not match:
        return Reference(url=url)
    arxiv_id = match.group(1)
    api_url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode({"id_list": arxiv_id})
    request = urllib.request.Request(api_url, headers={"User-Agent": "TraceViewerProducer/0.1"})
    with urllib.request.urlopen(request, timeout=15) as response:
        root = ET.fromstring(response.read())

    namespace = {"atom": "http://www.w3.org/2005/Atom"}
    entry = root.find("atom:entry", namespace)
    if entry is None:
        return Reference(url=url)
    authors = [
        author.findtext("atom:name", default="", namespaces=namespace)
        for author in entry.findall("atom:author", namespace)
    ]
    return Reference(
        url=url,
        title=entry.findtext("atom:title", default="", namespaces=namespace).strip(),
        authors=[author for author in authors if author],
        date=entry.findtext("atom:published", default=None, namespaces=namespace),
        description=entry.findtext("atom:summary", default="", namespaces=namespace).strip(),
    )
